import { Test, TestingModule } from '@nestjs/testing';
import { PointController } from './point.controller';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { TransactionType } from './point.model';

describe('PointController', () => {
  let pointController: PointController;
  // UserPointTable을 mocking하여 실제 DB 접근 없이 테스트
  let mockUserPointTable: jest.Mocked<UserPointTable>;
  // PointHistoryTable을 mocking하여 실제 DB 접근 없이 테스트
  let mockPointHistoryTable: jest.Mocked<PointHistoryTable>;

  beforeEach(async () => {
    // 각 테스트마다 mock 객체 초기화
    mockUserPointTable = {
      selectById: jest.fn(), // 유저 포인트 조회 mock
      insertOrUpdate: jest.fn(), // 유저 포인트 저장 mock
    } as any;

    mockPointHistoryTable = {
      insert: jest.fn(), // 포인트 내역 저장 mock
      selectAllByUserId: jest.fn(), // 포인트 내역 조회 mock
    } as any;

    // NestJS 테스트 모듈 생성 및 mock 주입
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PointController],
      providers: [
        { provide: UserPointTable, useValue: mockUserPointTable },
        { provide: PointHistoryTable, useValue: mockPointHistoryTable },
      ],
    }).compile();

    pointController = module.get<PointController>(PointController);
  });

  // 포인트 조회 테스트
  describe('point - 포인트 조회', () => {
    it('should return user point', async () => {
      // 정상적으로 유저 포인트를 반환하는 경우
      const userId = 1;
      mockUserPointTable.selectById.mockResolvedValue({
        id: userId,
        point: 1000,
        updateMillis: Date.now(),
      });

      const result = await pointController.point('1');

      expect(result.point).toBe(1000);
      expect(mockUserPointTable.selectById).toHaveBeenCalledWith(userId);
    });

    it('should throw error when user not found', async () => {
      // 유저가 존재하지 않을 때 예외 발생
      mockUserPointTable.selectById.mockResolvedValue(null as any);

      await expect(pointController.point('1')).rejects.toThrow(
        '유저 포인트 정보를 찾을 수 없습니다.',
      );
    });

    it('should return 0 points for non-existing user', async () => {
      // 포인트가 0인 유저
      const userId = 999;
      mockUserPointTable.selectById.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis: Date.now(),
      });

      const result = await pointController.point('999');

      expect(result.point).toBe(0);
    });
  });

  // 거래 내역 조회 테스트
  describe('history - 거래 내역 조회', () => {
    it('should return empty array when no history', async () => {
      // 거래 내역이 없을 때 빈 배열 반환
      mockPointHistoryTable.selectAllByUserId.mockResolvedValue([]);

      const result = await pointController.history('1');

      expect(result).toEqual([]);
      expect(mockPointHistoryTable.selectAllByUserId).toHaveBeenCalledWith(1);
    });

    it('should return all histories for user', async () => {
      // 거래 내역이 있을 때 정상 반환
      const userId = 1;
      const mockHistories = [
        {
          id: 1,
          userId,
          amount: 5000,
          type: TransactionType.CHARGE,
          timeMillis: Date.now(),
        },
      ];

      mockPointHistoryTable.selectAllByUserId.mockResolvedValue(mockHistories);

      const result = await pointController.history('1');

      expect(result.length).toBe(1);
      expect(result[0].type).toBe(TransactionType.CHARGE);
    });

    it('should throw error for invalid id (zero)', async () => {
      // 잘못된 id값 입력 시 예외
      await expect(pointController.history('0')).rejects.toThrow();
    });
  });

  // 포인트 충전 테스트
  describe('charge - 포인트 충전', () => {
    it('should increase points correctly', async () => {
      // 포인트 정상 충전
      const userId = 1;
      const updateMillis = Date.now();

      mockUserPointTable.selectById.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis,
      });

      mockUserPointTable.insertOrUpdate.mockResolvedValue({
        id: userId,
        point: 5000,
        updateMillis,
      });

      const result = await pointController.charge('1', { amount: 5000 });

      expect(result.point).toBe(5000);
      expect(mockUserPointTable.insertOrUpdate).toHaveBeenCalledWith(
        userId,
        5000,
      );
    });

    it('should create history record on charge', async () => {
      // 충전 시 거래 내역 생성
      const userId = 1;
      const updateMillis = Date.now();

      mockUserPointTable.selectById.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis,
      });

      mockUserPointTable.insertOrUpdate.mockResolvedValue({
        id: userId,
        point: 5000,
        updateMillis,
      });

      await pointController.charge('1', { amount: 5000 });

      expect(mockPointHistoryTable.insert).toHaveBeenCalledWith(
        userId,
        5000,
        TransactionType.CHARGE,
        updateMillis,
      );
    });

    it('should accumulate on multiple charges', async () => {
      // 여러 번 충전 시 누적
      const userId = 1;
      const updateMillis = Date.now();

      mockUserPointTable.selectById
        .mockResolvedValueOnce({ id: userId, point: 0, updateMillis })
        .mockResolvedValueOnce({ id: userId, point: 5000, updateMillis });

      mockUserPointTable.insertOrUpdate
        .mockResolvedValueOnce({ id: userId, point: 5000, updateMillis })
        .mockResolvedValueOnce({ id: userId, point: 8000, updateMillis });

      const result1 = await pointController.charge('1', { amount: 5000 });
      expect(result1.point).toBe(5000);

      const result2 = await pointController.charge('1', { amount: 3000 });
      expect(result2.point).toBe(8000);
    });

    it('should reject negative amount', async () => {
      // 음수 금액 충전 시 예외
      await expect(
        pointController.charge('1', { amount: -1000 }),
      ).rejects.toThrow();
    });

    it('should reject zero amount', async () => {
      // 0원 충전 시 예외
      await expect(
        pointController.charge('1', { amount: 0 }),
      ).rejects.toThrow();
    });

    it('should throw error when user not found', async () => {
      // 유저가 없을 때 예외
      mockUserPointTable.selectById.mockResolvedValue(null as any);

      await expect(
        pointController.charge('1', { amount: 5000 }),
      ).rejects.toThrow('유저 포인트 정보를 찾을 수 없습니다.');
    });
  });

  // 포인트 사용 테스트
  describe('use - 포인트 사용', () => {
    it('should decrease points correctly', async () => {
      // 포인트 정상 차감
      const userId = 1;
      const updateMillis = Date.now();

      mockUserPointTable.selectById.mockResolvedValue({
        id: userId,
        point: 10000,
        updateMillis,
      });

      mockUserPointTable.insertOrUpdate.mockResolvedValue({
        id: userId,
        point: 7000,
        updateMillis,
      });

      const result = await pointController.use('1', { amount: 3000 });

      expect(result.point).toBe(7000);
      expect(mockUserPointTable.insertOrUpdate).toHaveBeenCalledWith(
        userId,
        7000,
      );
    });

    it('should create history record on use', async () => {
      // 사용 시 거래 내역 생성
      const userId = 1;
      const updateMillis = Date.now();

      mockUserPointTable.selectById.mockResolvedValue({
        id: userId,
        point: 10000,
        updateMillis,
      });

      mockUserPointTable.insertOrUpdate.mockResolvedValue({
        id: userId,
        point: 8000,
        updateMillis,
      });

      await pointController.use('1', { amount: 2000 });

      expect(mockPointHistoryTable.insert).toHaveBeenCalledWith(
        userId,
        8000,
        TransactionType.USE,
        updateMillis,
      );
    });

    it('should reject use when insufficient balance', async () => {
      // 잔고 부족 시 예외
      mockUserPointTable.selectById.mockResolvedValue({
        id: 1,
        point: 5000,
        updateMillis: Date.now(),
      });

      await expect(pointController.use('1', { amount: 10000 })).rejects.toThrow(
        '포인트 잔고가 부족합니다.',
      );

      expect(mockUserPointTable.insertOrUpdate).not.toHaveBeenCalled();
      expect(mockPointHistoryTable.insert).not.toHaveBeenCalled();
    });

    it('should allow use when amount equals balance', async () => {
      // 잔고와 사용 금액이 같을 때
      const userId = 1;
      const updateMillis = Date.now();

      mockUserPointTable.selectById.mockResolvedValue({
        id: userId,
        point: 5000,
        updateMillis,
      });

      mockUserPointTable.insertOrUpdate.mockResolvedValue({
        id: userId,
        point: 0,
        updateMillis,
      });

      const result = await pointController.use('1', { amount: 5000 });

      expect(result.point).toBe(0);
    });

    it('should reject use for non-existing user', async () => {
      // 없는 유저가 사용 시도 시 예외
      mockUserPointTable.selectById.mockResolvedValue({
        id: 9999,
        point: 0,
        updateMillis: Date.now(),
      });

      await expect(
        pointController.use('9999', { amount: 1000 }),
      ).rejects.toThrow('포인트 잔고가 부족합니다.');
    });

    it('should handle sequential uses', async () => {
      // 연속 사용 시 정상 동작
      const userId = 1;
      const updateMillis = Date.now();

      mockUserPointTable.selectById
        .mockResolvedValueOnce({ id: userId, point: 10000, updateMillis })
        .mockResolvedValueOnce({ id: userId, point: 8000, updateMillis });

      mockUserPointTable.insertOrUpdate
        .mockResolvedValueOnce({ id: userId, point: 8000, updateMillis })
        .mockResolvedValueOnce({ id: userId, point: 5000, updateMillis });

      const result1 = await pointController.use('1', { amount: 2000 });
      expect(result1.point).toBe(8000);

      const result2 = await pointController.use('1', { amount: 3000 });
      expect(result2.point).toBe(5000);
    });

    it('should reject negative amount', async () => {
      // 음수 금액 사용 시 예외
      await expect(
        pointController.use('1', { amount: -1000 }),
      ).rejects.toThrow();
    });

    it('should reject zero amount', async () => {
      // 0원 사용 시 예외
      await expect(pointController.use('1', { amount: 0 })).rejects.toThrow();
    });

    it('should throw error when user not found', async () => {
      // 유저가 없을 때 예외
      mockUserPointTable.selectById.mockResolvedValue(null as any);

      await expect(pointController.use('1', { amount: 1000 })).rejects.toThrow(
        '유저 포인트 정보를 찾을 수 없습니다.',
      );
    });
  });

  // 통합 테스트 (충전/사용 반복)
  describe('Integration - 전체 플로우', () => {
    it('should handle complete flow: charge -> use -> charge -> use', async () => {
      // 충전 -> 사용 -> 충전 -> 사용
      const userId = 1;
      const updateMillis = Date.now();
      const charge1 = 10000;
      const use1 = 3000;
      const charge2 = 5000;
      const use2 = 2000;

      mockUserPointTable.selectById
        .mockResolvedValueOnce({ id: userId, point: 0, updateMillis })
        .mockResolvedValueOnce({
          id: userId,
          point: charge1,
          updateMillis,
        })
        .mockResolvedValueOnce({
          id: userId,
          point: charge1 - use1,
          updateMillis,
        })
        .mockResolvedValueOnce({
          id: userId,
          point: charge1 - use1 + charge2,
          updateMillis,
        });

      mockUserPointTable.insertOrUpdate
        .mockResolvedValueOnce({
          id: userId,
          point: charge1,
          updateMillis,
        })
        .mockResolvedValueOnce({
          id: userId,
          point: charge1 - use1,
          updateMillis,
        })
        .mockResolvedValueOnce({
          id: userId,
          point: charge1 - use1 + charge2,
          updateMillis,
        })
        .mockResolvedValueOnce({
          id: userId,
          point: charge1 - use1 + charge2 - use2,
          updateMillis,
        });

      // Charge 10000
      const after1stCharge = await pointController.charge('1', {
        amount: charge1,
      });
      expect(after1stCharge.point).toBe(charge1);

      // Use 3000
      const after1stUse = await pointController.use('1', { amount: use1 });
      expect(after1stUse.point).toBe(charge1 - use1);

      // Charge 5000
      const after2ndCharge = await pointController.charge('1', {
        amount: charge2,
      });
      expect(after2ndCharge.point).toBe(charge1 - use1 + charge2);

      // Use 2000
      const after2ndUse = await pointController.use('1', { amount: use2 });
      expect(after2ndUse.point).toBe(charge1 - use1 + charge2 - use2);

      expect(mockPointHistoryTable.insert).toHaveBeenCalledTimes(4);
    });
  });
});

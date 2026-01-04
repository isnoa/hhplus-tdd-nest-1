import { Test, TestingModule } from '@nestjs/testing';
import { PointController } from './point.controller';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { TransactionType } from './point.model';

describe('PointController', () => {
  let pointController: PointController;
  let mockUserPointTable: jest.Mocked<UserPointTable>;
  let mockPointHistoryTable: jest.Mocked<PointHistoryTable>;

  beforeEach(async () => {
    mockUserPointTable = {
      selectById: jest.fn(),
      insertOrUpdate: jest.fn(),
    } as any;

    mockPointHistoryTable = {
      insert: jest.fn(),
      selectAllByUserId: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PointController],
      providers: [
        { provide: UserPointTable, useValue: mockUserPointTable },
        { provide: PointHistoryTable, useValue: mockPointHistoryTable },
      ],
    }).compile();

    pointController = module.get<PointController>(PointController);
  });

  describe('point - 포인트 조회', () => {
    it('should return user point', async () => {
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
      mockUserPointTable.selectById.mockResolvedValue(null as any);

      await expect(pointController.point('1')).rejects.toThrow(
        '유저 포인트 정보를 찾을 수 없습니다.',
      );
    });

    it('should return 0 points for non-existing user', async () => {
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

  describe('history - 거래 내역 조회', () => {
    it('should return empty array when no history', async () => {
      mockPointHistoryTable.selectAllByUserId.mockResolvedValue([]);

      const result = await pointController.history('1');

      expect(result).toEqual([]);
      expect(mockPointHistoryTable.selectAllByUserId).toHaveBeenCalledWith(1);
    });

    it('should return all histories for user', async () => {
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
      await expect(pointController.history('0')).rejects.toThrow();
    });
  });

  describe('charge - 포인트 충전', () => {
    it('should increase points correctly', async () => {
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
      await expect(
        pointController.charge('1', { amount: -1000 }),
      ).rejects.toThrow();
    });

    it('should reject zero amount', async () => {
      await expect(
        pointController.charge('1', { amount: 0 }),
      ).rejects.toThrow();
    });

    it('should throw error when user not found', async () => {
      mockUserPointTable.selectById.mockResolvedValue(null as any);

      await expect(
        pointController.charge('1', { amount: 5000 }),
      ).rejects.toThrow('유저 포인트 정보를 찾을 수 없습니다.');
    });
  });

  describe('use - 포인트 사용', () => {
    it('should decrease points correctly', async () => {
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
      await expect(
        pointController.use('1', { amount: -1000 }),
      ).rejects.toThrow();
    });

    it('should reject zero amount', async () => {
      await expect(pointController.use('1', { amount: 0 })).rejects.toThrow();
    });

    it('should throw error when user not found', async () => {
      mockUserPointTable.selectById.mockResolvedValue(null as any);

      await expect(pointController.use('1', { amount: 1000 })).rejects.toThrow(
        '유저 포인트 정보를 찾을 수 없습니다.',
      );
    });
  });

  describe('Integration - 전체 플로우', () => {
    it('should handle complete flow: charge -> use -> charge -> use', async () => {
      const userId = 1;
      const updateMillis = Date.now();
      const charge1 = 10000;
      const use1 = 3000;
      const charge2 = 5000;
      const use2 = 2000;

      // Mock selectById calls: [init, after charge1, after use1, after charge2]
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

      // Mock insertOrUpdate calls: [charge1, use1, charge2, use2]
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

      // Verify history created for all transactions
      expect(mockPointHistoryTable.insert).toHaveBeenCalledTimes(4);
    });
  });
});

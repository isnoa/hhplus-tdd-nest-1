import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ValidationPipe,
} from '@nestjs/common';
import { PointHistory, TransactionType, UserPoint } from './point.model';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { PointBody as PointDto } from './point.dto';

@Controller('/point')
export class PointController {
  constructor(
    private readonly userDb: UserPointTable,
    private readonly historyDb: PointHistoryTable,
  ) {}

  /**
   * TODO - 특정 유저의 포인트를 조회하는 기능을 작성해주세요.
   */
  @Get(':id')
  async point(@Param('id') id): Promise<UserPoint> {
    const userId = Number.parseInt(id);

    const userPoint = await this.userDb.selectById(userId);
    if (!userPoint) {
      throw new Error('유저 포인트 정보를 찾을 수 없습니다.');
    }

    return {
      id: userId,
      point: userPoint.point,
      updateMillis: userPoint.updateMillis,
    };
  }

  /**
   * TODO - 특정 유저의 포인트 충전/이용 내역을 조회하는 기능을 작성해주세요.
   */
  @Get(':id/histories')
  async history(@Param('id') id): Promise<PointHistory[]> {
    const userId = Number.parseInt(id);
    if (!userId) {
      throw new Error('유저 포인트 정보를 찾을 수 없습니다.');
    }

    const histories = await this.historyDb.selectAllByUserId(userId);
    return histories;
  }

  /**
   * TODO - 특정 유저의 포인트를 충전하는 기능을 작성해주세요.
   */
  @Patch(':id/charge')
  async charge(
    @Param('id') id,
    @Body(ValidationPipe) pointDto: PointDto,
  ): Promise<UserPoint> {
    const userId = Number.parseInt(id);
    const amount = pointDto.amount;

    const userPoint = await this.userDb.selectById(userId);
    if (!userPoint) {
      throw new Error('유저 포인트 정보를 찾을 수 없습니다.');
    }

    const totalAmount = userPoint.point + amount;
    await this.userDb.insertOrUpdate(userId, totalAmount);

    await this.historyDb.insert(
      userId,
      totalAmount,
      TransactionType.CHARGE,
      userPoint.updateMillis,
    );

    return {
      id: userId,
      point: totalAmount,
      updateMillis: userPoint.updateMillis,
    };
  }

  /**
   * TODO - 특정 유저의 포인트를 사용하는 기능을 작성해주세요.
   */
  @Patch(':id/use')
  async use(
    @Param('id') id,
    @Body(ValidationPipe) pointDto: PointDto,
  ): Promise<UserPoint> {
    const userId = Number.parseInt(id);
    const amount = pointDto.amount;

    const userPoint = await this.userDb.selectById(userId);
    if (!userPoint) {
      throw new Error('유저 포인트 정보를 찾을 수 없습니다.');
    }

    const totalAmount = userPoint.point - amount;
    if (totalAmount < 0) {
      throw new Error('포인트 잔고가 부족합니다.');
    }

    await this.userDb.insertOrUpdate(userId, totalAmount);
    await this.historyDb.insert(
      userId,
      totalAmount,
      TransactionType.USE,
      userPoint.updateMillis,
    );

    return {
      id: userId,
      point: totalAmount,
      updateMillis: userPoint.updateMillis,
    };
  }
}

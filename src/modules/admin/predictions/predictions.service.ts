import { Injectable } from '@nestjs/common';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaClient, PredictionStatus } from 'prisma/generated/client';

@Injectable()
export class PredictionsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(userid: string, createPredictionDto: CreatePredictionDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userid, type: 'admin' },
      });

      if (!user) {
        return {
          success: false,
          message: 'Unauthorized',
        };
      }

      const checkCategory = await this.prisma.category.findUnique({
        where: { id: createPredictionDto.category_id },
      });
      if (!checkCategory) {
        return {
          success: false,
          message: 'Invalid category_id',
        };
      }
      const prediction = await this.prisma.prediction.create({
        data: {
          notes: createPredictionDto.notes,
          userid: userid,
          category_id: createPredictionDto.category_id,
          status: PredictionStatus.OPEN,
        },
      });
      return {
        success: true,
        message: 'Prediction created successfully',
        data: prediction,
      };
    } catch (error) {
      throw error;
    }
  }
  async getAllWithcategoryId(category_id: string) {
    try {
      const [predictions, openCount] = await this.prisma.$transaction([
        this.prisma.prediction.findMany({
          where: { category_id },
        }),
        this.prisma.prediction.count({
          where: {
            category_id,
            status: 'OPEN',
          },
        }),
      ]);

      if (predictions.length === 0) {
        return {
          success: false,
          message: 'No predictions found for the given category_id',
        };
      }

      return {
        success: true,
        message: 'Predictions fetched successfully',
        data: predictions,
        openCount,
      };
    } catch (error) {
      throw error;
    }
  }
  async getAllPredictions(userid: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userid },
    });

    if (!user || user.type !== 'admin') {
      return {
        success: false,
        message: 'Unauthorized',
      };
    }

    const predictions = await this.prisma.prediction.findMany({
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (predictions.length === 0) {
      return {
        success: false,
        message: 'No predictions found',
      };
    }

    const categoryIds = [...new Set(predictions.map((p) => p.category_id))];

    const categoryStats = await Promise.all(
      categoryIds.map(async (category_id) => {
        const total = await this.prisma.prediction.count({
          where: { category_id },
        });

        const wins = await this.prisma.prediction.count({
          where: { category_id, status: 'WIN' },
        });

        return {
          category_id,
          win_rate: total === 0 ? 0 : Number(((wins / total) * 100).toFixed(2)),
        };
      }),
    );

    const winRateMap = new Map(
      categoryStats.map((s) => [s.category_id, s.win_rate]),
    );

    const data = predictions.map((p) => ({
      ...p,
      category: {
        ...p.category,
        win_rate: winRateMap.get(p.category_id) ?? 0,
      },
    }));

    const total = predictions.length;
    const wins = predictions.filter((p) => p.status === 'WIN').length;
    const open = predictions.filter((p) => p.status === 'OPEN').length;
    const win_rate =
      total === 0 ? 0 : Number(((wins / total) * 100).toFixed(2));

    return {
      success: true,
      message: 'Predictions fetched successfully',
      data,
    };
  }
  async update(
    id: string,
    updatePredictionDto: UpdatePredictionDto,
    userId: string,
  ) {
    try {
      const user = this.prisma.user.findUnique({
        where: { id: userId, type: 'admin' },
      });
      if (!user) {
        return {
          success: false,
          message: 'Unauthorized',
        };
      }
      const check = await this.prisma.prediction.findUnique({
        where: { id: id },
      });
      if (!check) {
        return {
          success: false,
          message: 'Prediction not found',
        };
      }
      let updatedStatus = updatePredictionDto.status;
      if (
        updatedStatus === 'WIN' ||
        updatedStatus === 'LOSE' ||
        updatedStatus === 'CANCEL' ||
        updatedStatus === 'OPEN'
      ) {
        const prediction = await this.prisma.prediction.update({
          where: { id: id },
          data: {
            status: updatedStatus as PredictionStatus,
          },
        });
        return {
          success: true,
          message: 'Prediction updated successfully',
          data: prediction,
        };
      }else{
        return {
          success: false,
          message: 'Invalid status value and must be one of WIN, LOSE, CANCEL, OPEN',
        };
      }
    } catch (error) {
      throw error;
    }
  }
  async remove(id: string, userid: string) {
    try {
      const user = this.prisma.user.findUnique({
        where: { id: userid, type: 'admin' },
      });
      if (!user) {
        return {
          success: false,
          message: 'Unauthorized',
        };
      }
      const check = await this.prisma.prediction.findUnique({
        where: { id: id },
      });
      if (!check) {
        return {
          success: false,
          message: 'Prediction not found',
        };
      }
      await this.prisma.prediction.delete({
        where: { id: id },
      });
      return {
        success: true,
        message: 'Prediction deleted successfully',
      };
    } catch (error) {}
  }
}

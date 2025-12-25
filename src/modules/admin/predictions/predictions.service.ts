import { Injectable } from '@nestjs/common';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PredictionsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(userid:string,createPredictionDto: CreatePredictionDto) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userid , type: 'admin' },
        
      })
      
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
          category_id:createPredictionDto.category_id,
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
      const predictions = await this.prisma.prediction.findMany({
        where: { category_id: category_id },
      });
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
      };
    } catch (error) {
      throw error;
    }
  }

  findAll() {
    return `This action returns all predictions`;
  }

  findOne(id: number) {
    return `This action returns a #${id} prediction`;
  }

  update(id: number, updatePredictionDto: UpdatePredictionDto) {
    return `This action updates a #${id} prediction`;
  }

  remove(id: number) {
    return `This action removes a #${id} prediction`;
  }
}

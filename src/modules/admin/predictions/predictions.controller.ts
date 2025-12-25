import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { UpdatePredictionDto } from './dto/update-prediction.dto';
import { use } from 'passport';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@Controller('admin/predictions')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}
  
  @UseGuards(JwtAuthGuard)
  @Post('create')
  create(@Req() req: any, @Body() createPredictionDto: CreatePredictionDto) {
    const user_id = req.user.userId;
    return this.predictionsService.create(user_id, createPredictionDto);
  }

  @Get("getAll/:category_id")
  findAll(@Param('category_id') category_id: string) {
    return this.predictionsService.getAllWithcategoryId(category_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.predictionsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePredictionDto: UpdatePredictionDto,
  ) {
    return this.predictionsService.update(+id, updatePredictionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.predictionsService.remove(+id);
  }
}

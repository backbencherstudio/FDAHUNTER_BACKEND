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
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';

@Controller('admin/category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.categoryService.create(createCategoryDto, userId);
    // return {
    //   success: false,
    //   message: 'This service is currently disabled',
    // };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sub')
  createSub(@Body() dto: CreateCategoryDto, @Req() req: any) {
    const user = req.user;
    if (dto.parent_id) {
      return this.categoryService.createSubCategory(dto, user.userId);
    }
    return {
      success: false,
      message: 'parent_id is required for subcategory',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('parents')
  findAll(@Req() req: any) {
    const userId = req.user.userId;
    return this.categoryService.getAllParentCategories(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('subs')
  findAllSubs(@Req() req: any) {
    const userId = req.user.userId;
    return this.categoryService.getAllSubCategories(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update/:id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Req() req: any,
  ) {
    return this.categoryService.updateCategoryById(
      req.user.userId,
      id,
      updateCategoryDto,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.categoryService.deleteCategoryById(id, req.user.userId);
  }
}

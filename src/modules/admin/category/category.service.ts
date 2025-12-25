import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}
  async create(createCategoryDto: CreateCategoryDto, userId: string) {
    try {
      if (!userId) {
        return {
          success: false,
          message: 'Unauthorized',
        };
      }

      const checkUser = await this.prisma.user.findUnique({
        where: {
          id: userId,
          type: 'admin',
        },
      });

      if (!checkUser) {
        return {
          success: false,
          message: 'Unauthorized',
        };
      }

      const createCategory = await this.prisma.category.create({
        data: {
          name: createCategoryDto.name,
          parent_id: createCategoryDto.parent_id || null,
        },
      });

      return {
        success: true,
        message: 'Category created successfully',
        data: createCategory,
      };
    } catch (error) {
      throw error;
    }
  }
  async createSubCategory(dto: CreateCategoryDto, userId: string) {
    if (!userId) {
      throw new UnauthorizedException();
    }

    const adminUser = await this.prisma.user.findFirst({
      where: {
        id: userId,
        type: 'admin',
      },
    });

    if (!adminUser) {
      throw new ForbiddenException('Admin access required');
    }

    const parentCategory = await this.prisma.category.findUnique({
      where: {
        id: dto.parent_id,
      },
    });

    if (!parentCategory) {
      throw new BadRequestException('Parent category not found');
    }

    const subCategory = await this.prisma.category.create({
      data: {
        name: dto.name,
        parent_id: parentCategory.id,
        parent_name: parentCategory.name,
        userid: userId,
      },
    });

    return subCategory;
  }
  async getAllParentCategories(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
          type: 'admin',
        },
      });

      if (!user) {
        throw new UnauthorizedException();
      }

      const parentCategories = await this.prisma.category.findMany({
        select: {
          id: true,
          name: true,
          description: true,
        },
        where: {
          parent_id: null,
        },
      });
      return {
        success: true,
        message: 'Parent categories fetched successfully',
        data: parentCategories,
      };
    } catch (error) {
      throw error;
    }
  }
  async getAllSubCategories(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
          type: 'admin',
        },
      });

      if (!user) {
        throw new UnauthorizedException();
      }

      const parentCategories = await this.prisma.category.findMany({
        where: {
          parent_id: {
            not: null,
          },
        },
      });
      return {
        success: true,
        message: 'Parent categories fetched successfully',
        data: parentCategories,
      };
    } catch (error) {
      throw error;
    }
  }
  async deleteCategoryById(id: string, userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
          type: 'admin',
        },
      });
      if (!user) {
        throw new UnauthorizedException();
      }
      const checkCategory = await this.prisma.category.findUnique({
        where: {
          id: id,
        },
      });
      if (!checkCategory) {
        throw new BadRequestException('Category not found');
      }
      await this.prisma.category.delete({
        where: {
          id: id,
        },
      });
      return { success: true, message: 'Category deleted successfully' };
    } catch (error) {
      throw error;
    }
  }
  async updateCategoryById(
    userId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
          type: 'admin',
        },
      });

      if (!user) {
        throw new UnauthorizedException();
      }

      const checkCategory = await this.prisma.category.findUnique({
        where: {
          id: categoryId,
        },
      });

      if (!checkCategory) {
        throw new BadRequestException('Category not found');
      }
      const updatedCategory = await this.prisma.category.update({
        where: {
          id: categoryId,
        },
        data: {
          name: dto.name,
          description: dto.description,
        },
      });

      return {
        success: true,
        message: 'Category updated successfully',
        data: updatedCategory,
      };
    } catch (error) {
      throw error;
    }
  }
}

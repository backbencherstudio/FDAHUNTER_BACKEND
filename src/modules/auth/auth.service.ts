// external imports
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { randomInt } from 'crypto';

//internal imports
import appConfig from '../../config/app.config';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRepository } from '../../common/repository/user/user.repository';
import { UcodeRepository } from '../../common/repository/ucode/ucode.repository';
import { MailService } from '../../mail/mail.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { SojebStorage } from '../../common/lib/Disk/SojebStorage';
import { DateHelper } from '../../common/helper/date.helper';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';
import { StringHelper } from '../../common/helper/string.helper';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService,
    private userRepository: UserRepository,
    private ucodeRepository: UcodeRepository,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  //----------------------- Signup -----------------------
  // signup Step 1
  async register({
    name,
    first_name,
    last_name,
    email,
    password,
    type,
  }: {
    name: string;
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    type?: string;
  }) {
    try {
      const userEmailExist = await this.userRepository.exist({
        field: 'email',
        value: String(email),
      });

      if (userEmailExist) {
        return {
          statusCode: 401,
          message: 'Email already exist',
        };
      }

   const otp = String(randomInt(100000, 1000000));

      const registrationData = {
        name: name,
        first_name: first_name,
        last_name: last_name,
        email: email,
        password: password,
        type: type,
        otp: otp,
        created_at: new Date().toISOString(),
      };

      await this.redis.set(
        `registration:${email}`,
        JSON.stringify(registrationData),
        'EX',
        5 * 60,
      );

      // Send OTP to email
      await this.mailService.sendOtpCodeToEmail({
        email: email,
        name: name,
        otp: otp,
      });

      return {
        success: true,
        otp: process.env.NODE_ENV === 'development' ? otp : null,
        message: 'please check your email for verification code',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // signup Step 1.5 - Resend OTP
  async resendRegistrationOtp(email: string) {
    try {
      const redisKey = `registration:${email}`;
      const registrationDataStr = await this.redis.get(redisKey);

      if (!registrationDataStr) {
        return {
          success: false,
          message: 'Registration not found. Please register again.',
        };
      }

      const registrationData = JSON.parse(registrationDataStr);

      const newOtp = String(randomInt(100000, 1000000));

      const updatedRegistrationData = {
        ...registrationData,
        otp: newOtp,
        created_at: new Date().toISOString(),
      };

      await this.redis.set(
        redisKey,
        JSON.stringify(updatedRegistrationData),
        'EX',
        5 * 60,
      );

      await this.mailService.sendOtpCodeToEmail({
        email: email,
        name: registrationData.name,
        otp: newOtp,
      });

      return {
        success: true,
        otp: process.env.NODE_ENV === 'development' ? newOtp : null,
        message: 'OTP code resent to your email',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // signup Step 2
  async verifyEmail({ email, otp }) {
    try {
      const redisKey = `registration:${email}`;
      const registrationDataStr = await this.redis.get(redisKey);

      if (!registrationDataStr) {
        return {
          success: false,
          message: 'Registration not found. Please register again.',
        };
      }

      const registrationData = JSON.parse(registrationDataStr);

      if (registrationData.otp !== otp) {
        return {
          success: false,
          message: 'Invalid OTP code',
        };
      }

      // Check if email already exists in database (double check)
      const userEmailExist = await this.userRepository.exist({
        field: 'email',
        value: email,
      });

      if (userEmailExist) {
        // Clean up Redis data
        await this.redis.del(redisKey);
        return {
          success: false,
          message: 'Email already registered',
        };
      }

      let stripeCustomerId = null;
      try {
        const stripeCustomer = await StripePayment.createCustomer({
          user_id: '',
          email: email,
          name: registrationData.name,
        });
        stripeCustomerId = stripeCustomer?.id || null;
      } catch (stripeError) {
        console.error('Stripe customer creation failed:', stripeError);
      }

      const hashedPassword = await bcrypt.hash(
        registrationData.password,
        appConfig().security.salt,
      );

      const user = await this.prisma.user.create({
        data: {
          name: registrationData.name,
          first_name: registrationData.first_name,
          last_name: registrationData.last_name,
          email: registrationData.email,
          password: hashedPassword,
          type: registrationData.type || 'user',
          billing_id: stripeCustomerId,
        },
      });

      const jwtToken = this.jwtService.sign({
        email: email,
        id: user.id,
        type: user.type,
        name: user.name,
      });

      await this.redis.del(redisKey);

      // Prepare user data
      const userData: any = {
        id: user.id,
        email: user.email,
        name: user.name,
        type: user.type,
      };

      // Add avatar_url if avatar exists
      if (user.avatar) {
        userData.avatar_url = SojebStorage.url(
          appConfig().storageUrl.avatar + user.avatar,
        );
      }

      // Add other user info
      if (user.first_name) userData.first_name = user.first_name;
      if (user.last_name) userData.last_name = user.last_name;
      if (user.phone_number) userData.phone_number = user.phone_number;
      if (user.address) userData.address = user.address;
      if (user.country) userData.country = user.country;
      if (user.state) userData.state = user.state;
      if (user.city) userData.city = user.city;
      if (user.zip_code) userData.zip_code = user.zip_code;
      if (user.gender) userData.gender = user.gender;
      if (user.date_of_birth) userData.date_of_birth = user.date_of_birth;
      if (user.category) userData.category = user.category;
      if (user.created_at) userData.created_at = user.created_at;

      return {
        success: true,
        message: 'Email verified and account created successfully',
        token: jwtToken,
        data: userData,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  //----------------------- Forgot Password -----------------------
  // Step 1: Send OTP to email
  async forgotPassword(email: string) {
    try {
      const user = await this.userRepository.getUserByEmail(email);

      if (!user) {
        return {
          success: false,
          message: 'Email not found',
        };
      }

      const otp = String(randomInt(100000, 1000000));  

      const forgotPasswordData = {
        email: email,
        user_id: user.id,
        name: user.name,
        otp: otp,
        created_at: new Date().toISOString(),
      };

      const redisKey = `forgot_password:${email}`;
      await this.redis.set(
        redisKey,
        JSON.stringify(forgotPasswordData),
        'EX',
        10 * 60, // 10 minutes
      );

      await this.mailService.sendForgotPasswordOtp({
        email: email,
        name: user.name,
        otp: otp,
      });

      return {
        success: true,
        otp: process.env.NODE_ENV === 'development' ? otp : null,
        message: 'OTP code sent to your email',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Step 2: Verify OTP and grant permission
  async verifyForgotPasswordOtp({ email, otp }) {
    try {
      const redisKey = `forgot_password:${email}`;
      const forgotPasswordDataStr = await this.redis.get(redisKey);

      if (!forgotPasswordDataStr) {
        return {
          success: false,
          message: 'Password reset request not found. Please request again.',
        };
      }

      const forgotPasswordData = JSON.parse(forgotPasswordDataStr);

      if (forgotPasswordData.otp !== otp) {
        return {
          success: false,
          message: 'Invalid OTP code',
        };
      }

      // Store permission to reset password (10 minutes)
      const permissionKey = `forgot_password_permission:${email}`;
      await this.redis.set(
        permissionKey,
        JSON.stringify({
          email: email,
          user_id: forgotPasswordData.user_id,
          verified_at: new Date().toISOString(),
        }),
        'EX',
        10 * 60, // 10 minutes
      );

      // Clean up the OTP data
      await this.redis.del(redisKey);

      return {
        success: true,
        message: 'OTP verified. You can now reset your password.',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Step 3: Reset password with permission
  async resetPassword({ email, password }) {
    try {
      const permissionKey = `forgot_password_permission:${email}`;
      const permissionDataStr = await this.redis.get(permissionKey);

      if (!permissionDataStr) {
        return {
          success: false,
          message: 'Permission not found. Please verify OTP again.',
        };
      }

      const permissionData = JSON.parse(permissionDataStr);

      // Update password
      await this.userRepository.changePassword({
        email: email,
        password: password,
      });

      // Clean up permission
      await this.redis.del(permissionKey);

      // Get user to send success email
      const user = await this.userRepository.getUserByEmail(email);
      if (user) {
        await this.mailService.sendPasswordResetSuccess({
          email: email,
          name: user.name,
        });
      }

      return {
        success: true,
        message: 'Password reset successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Step 4: Resend forgot password OTP
  async resendForgotPasswordOtp(email: string) {
    try {
      const redisKey = `forgot_password:${email}`;
      const forgotPasswordDataStr = await this.redis.get(redisKey);

      if (!forgotPasswordDataStr) {
        return {
          success: false,
          message: 'Password reset request not found. Please request again.',
        };
      }

      const forgotPasswordData = JSON.parse(forgotPasswordDataStr);

      const newOtp = String(randomInt(1000, 10000));

      const updatedForgotPasswordData = {
        ...forgotPasswordData,
        otp: newOtp,
        created_at: new Date().toISOString(),
      };

      await this.redis.set(
        redisKey,
        JSON.stringify(updatedForgotPasswordData),
        'EX',
        10 * 60, // 10 minutes
      );

      await this.mailService.sendForgotPasswordOtp({
        email: email,
        name: forgotPasswordData.name,
        otp: newOtp,
      });

      return {
        success: true,
        otp: process.env.NODE_ENV === 'development' ? newOtp : null,
        message: 'OTP code resent to your email',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }


  
  //----------------------- Me -----------------------
  async me(userId: string) {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          address: true,
          phone_number: true,
          type: true,
          category: true,
          gender: true,
          date_of_birth: true,
          created_at: true,
        },
      });

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      if (user.avatar) {
        user['avatar_url'] = SojebStorage.url(
          appConfig().storageUrl.avatar + user.avatar,
        );
      }

      if (user) {
        return {
          success: true,
          data: user,
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
    image?: Express.Multer.File,
  ) {
    try {
      // Debug: log received DTO
      console.log('updateUser - Received DTO:', JSON.stringify(updateUserDto, null, 2));
      const data: any = {};
      if (updateUserDto.name !== undefined) {
        data.name = updateUserDto.name;
      }
      if (updateUserDto.first_name !== undefined) {
        data.first_name = updateUserDto.first_name;
      }
      if (updateUserDto.last_name !== undefined) {
        data.last_name = updateUserDto.last_name;
      }
      if (updateUserDto.phone_number !== undefined) {
        data.phone_number = updateUserDto.phone_number;
      }
      if (updateUserDto.country !== undefined) {
        data.country = updateUserDto.country;
      }
      if (updateUserDto.state !== undefined) {
        data.state = updateUserDto.state;
      }
      if (updateUserDto.local_government !== undefined) {
        data.local_government = updateUserDto.local_government;
      }
      if (updateUserDto.city !== undefined) {
        data.city = updateUserDto.city;
      }
      if (updateUserDto.zip_code !== undefined) {
        data.zip_code = updateUserDto.zip_code;
      }
      if (updateUserDto.address !== undefined) {
        data.address = updateUserDto.address;
      }
      if (updateUserDto.gender !== undefined) {
        data.gender = updateUserDto.gender;
      }
      if (updateUserDto.date_of_birth !== undefined) {
        data.date_of_birth = DateHelper.format(updateUserDto.date_of_birth);
      }
      // Handle both 'category' and 'catagoary' (typo) for backward compatibility
      if (updateUserDto.category !== undefined) {
        data.category = updateUserDto.category;
      } else if ((updateUserDto as any).catagoary !== undefined) {
        // Handle typo: catagoary -> category
        data.category = (updateUserDto as any).catagoary;
      }
      if (image) {
        // delete old image from storage
        const oldImage = await this.prisma.user.findFirst({
          where: { id: userId },
          select: { avatar: true },
        });
        if (oldImage.avatar) {
          await SojebStorage.delete(
            appConfig().storageUrl.avatar + oldImage.avatar,
          );
        }

        // upload file
        const fileName = `${StringHelper.randomString()}${image.originalname}`;
        await SojebStorage.put(
          appConfig().storageUrl.avatar + fileName,
          image.buffer,
        );

        data.avatar = fileName;
      }
      const user = await this.userRepository.getUserDetails(userId);
      if (user) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            ...data,
          },
        });

        // Prepare response data with all updated fields
        const responseData: any = {};
        
        // Include all updated fields in response
        if (data.name !== undefined) responseData.name = data.name;
        if (data.first_name !== undefined) responseData.first_name = data.first_name;
        if (data.last_name !== undefined) responseData.last_name = data.last_name;
        if (data.phone_number !== undefined) responseData.phone_number = data.phone_number;
        if (data.country !== undefined) responseData.country = data.country;
        if (data.state !== undefined) responseData.state = data.state;
        if (data.local_government !== undefined) responseData.local_government = data.local_government;
        if (data.city !== undefined) responseData.city = data.city;
        if (data.zip_code !== undefined) responseData.zip_code = data.zip_code;
        if (data.address !== undefined) responseData.address = data.address;
        if (data.gender !== undefined) responseData.gender = data.gender;
        if (data.date_of_birth !== undefined) responseData.date_of_birth = data.date_of_birth;
        if (data.category !== undefined) responseData.category = data.category;
        if (data.avatar) {
          responseData.avatar = data.avatar;
          responseData.avatar_url = SojebStorage.url(
            appConfig().storageUrl.avatar + data.avatar,
          );
        }

        return {
          success: true,
          message: 'User updated successfully',
          data: responseData,
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async validateUser(
    email: string,
    pass: string,
    token?: string,
  ): Promise<any> {
    const _password = pass;
    const user = await this.prisma.user.findFirst({
      where: {
        email: email,
      },
    });

    if (user) {
      const _isValidPassword = await this.userRepository.validatePassword({
        email: email,
        password: _password,
      });
      if (_isValidPassword) {
        const { password, ...result } = user;
        if (user.is_two_factor_enabled) {
          if (token) {
            const isValid = await this.userRepository.verify2FA(user.id, token);
            if (!isValid) {
              throw new UnauthorizedException('Invalid token');
              // return {
              //   success: false,
              //   message: 'Invalid token',
              // };
            }
          } else {
            throw new UnauthorizedException('Token is required');
            // return {
            //   success: false,
            //   message: 'Token is required',
            // };
          }
        }
        return result;
      } else {
        throw new UnauthorizedException('Password not matched');
        // return {
        //   success: false,
        //   message: 'Password not matched',
        // };
      }
    } else {
      throw new UnauthorizedException('Email not found');
      // return {
      //   success: false,
      //   message: 'Email not found',
      // };
    }
  }

  async login({ email, userId }) {
    try {
      const user = await this.userRepository.getUserDetails(userId);

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      // Generate single lifetime token
      const jwtToken = this.jwtService.sign({
        email: email,
        id: user.id,
        type: user.type,
        name: user.name,
      });

      // Prepare user data
      const userData: any = {
        id: user.id,
        email: user.email,
        name: user.name,
        type: user.type,
      };

      // Add avatar_url if avatar exists
      if (user.avatar) {
        userData.avatar_url = SojebStorage.url(
          appConfig().storageUrl.avatar + user.avatar,
        );
      }

      // Add other user info
      if (user.first_name) userData.first_name = user.first_name;
      if (user.last_name) userData.last_name = user.last_name;
      if (user.phone_number) userData.phone_number = user.phone_number;
      if (user.address) userData.address = user.address;
      if (user.country) userData.country = user.country;
      if (user.state) userData.state = user.state;
      if (user.city) userData.city = user.city;
      if (user.zip_code) userData.zip_code = user.zip_code;
      if (user.gender) userData.gender = user.gender;
      if (user.date_of_birth) userData.date_of_birth = user.date_of_birth;
      if (user.category) userData.category = user.category;
      if (user.created_at) userData.created_at = user.created_at;

      return {
        success: true,
        message: 'Logged in successfully',
        token: jwtToken,
        data: userData,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async refreshToken(user_id: string, refreshToken: string) {
    try {
      const storedToken = await this.redis.get(`refresh_token:${user_id}`);

      if (!storedToken || storedToken != refreshToken) {
        return {
          success: false,
          message: 'Refresh token is required',
        };
      }

      if (!user_id) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      const userDetails = await this.userRepository.getUserDetails(user_id);
      if (!userDetails) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      const payload = { email: userDetails.email, sub: userDetails.id };
      const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });

      return {
        success: true,
        authorization: {
          type: 'bearer',
          access_token: accessToken,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async revokeRefreshToken(user_id: string) {
    try {
      const storedToken = await this.redis.get(`refresh_token:${user_id}`);
      if (!storedToken) {
        return {
          success: false,
          message: 'Refresh token not found',
        };
      }

      await this.redis.del(`refresh_token:${user_id}`);

      return {
        success: true,
        message: 'Refresh token revoked successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }



  async resendVerificationEmail(email: string) {
    try {
      // First check if there's a pending registration in Redis
      const redisKey = `registration:${email}`;
      const registrationDataStr = await this.redis.get(redisKey);

      if (registrationDataStr) {
        // If pending registration exists, resend registration OTP
        return await this.resendRegistrationOtp(email);
      }

      // If no pending registration, check if user exists in database
      const user = await this.userRepository.getUserByEmail(email);
      // check if user exist and already verified
      if (user && user.email_verified_at != null) {
        return {
          success: false,
          message: 'Email already verified at ' + user.email_verified_at,
        };
      }
      if (user) {
        // create otp code
        const token = await this.ucodeRepository.createToken({
          userId: user.id,
          isOtp: true,
        });

        // send otp code to email
        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: user.name,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent a verification code to your email',
          otp: token,
        };
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async changePassword({ user_id, oldPassword, newPassword }) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);

      if (user) {
        const _isValidPassword = await this.userRepository.validatePassword({
          email: user.email,
          password: oldPassword,
        });
        if (_isValidPassword) {
          await this.userRepository.changePassword({
            email: user.email,
            password: newPassword,
          });

          return {
            success: true,
            message: 'Password updated successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid password',
          };
        }
      } else {
        return {
          success: false,
          message: 'Email not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async requestEmailChange(user_id: string, email: string) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);
      if (user) {
        const token = await this.ucodeRepository.createToken({
          userId: user.id,
          isOtp: true,
          email: email,
        });

        await this.mailService.sendOtpCodeToEmail({
          email: email,
          name: email,
          otp: token,
        });

        return {
          success: true,
          message: 'We have sent an OTP code to your email',
        };
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async changeEmail({
    user_id,
    new_email,
    token,
  }: {
    user_id: string;
    new_email: string;
    token: string;
  }) {
    try {
      const user = await this.userRepository.getUserDetails(user_id);

      if (user) {
        const existToken = await this.ucodeRepository.validateToken({
          email: new_email,
          token: token,
          forEmailChange: true,
        });

        if (existToken) {
          await this.userRepository.changeEmail({
            user_id: user.id,
            new_email: new_email,
          });

          // delete otp code
          await this.ucodeRepository.deleteToken({
            email: new_email,
            token: token,
          });

          return {
            success: true,
            message: 'Email updated successfully',
          };
        } else {
          return {
            success: false,
            message: 'Invalid token',
          };
        }
      } else {
        return {
          success: false,
          message: 'User not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async googleLogin() {}
  async userPreferences(userId: string, categoryIds: string[]) {
    if (!categoryIds || categoryIds.length === 0) {
      throw new BadRequestException('Category IDs are required');
    }

    const duplicates = categoryIds.filter(
      (id, index) => categoryIds.indexOf(id) !== index,
    );
    if (duplicates.length > 0) {
      throw new BadRequestException(
        `Cannot add duplicate category IDs: ${[...new Set(duplicates)].join(', ')}`,
      );
    }

    const categories = await this.prisma.category.findMany({
      where: {
        id: { in: categoryIds },
        parent_id: null,
      },
      select: { id: true },
    });

    const validIds = categories.map((c) => c.id);
    const invalidIds = categoryIds.filter((id) => !validIds.includes(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Invalid or category IDs: ${invalidIds.join(', ')}`,
      );
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { user_preferences: categoryIds },
        select: { user_preferences: true },
      });
    } catch (err) {
      throw new NotFoundException('User not found');
    }
  }
}

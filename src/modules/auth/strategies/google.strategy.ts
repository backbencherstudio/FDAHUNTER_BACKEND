import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import appConfig from '../../../config/app.config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const config = appConfig().auth.google;
     console.log("Google Strategy Config:", config);
    super({
      clientID: config.app_id,
      clientSecret: config.app_secret,
      callbackURL:'https://celebs-flight-moore-ceo.trycloudflare.com/api/auth/google/redirect',
      scope: ['email', 'profile'],
    });

  }

  

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { name, emails, photos, id } = profile;

      const user = {
        googleId: id,
        email: emails?.[0]?.value || null,
        firstName: name?.givenName || null,
        lastName: name?.familyName || null,
        picture: photos?.[0]?.value || null,
        accessToken,
        refreshToken,
      };

      // Pass the user object to the request
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  }
}

const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: GitHubStrategy } = require('passport-github2');
const { findOrCreateSocialUser } = require('../models/userModel');

function configureGoogleStrategy() {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    return;
  }

  const callbackURL =
    process.env.GOOGLE_CALLBACK_URL ||
    `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/google/callback`;

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const primaryEmail =
            Array.isArray(profile.emails) && profile.emails[0] && profile.emails[0].value
              ? profile.emails[0].value.toLowerCase()
              : null;

          if (!primaryEmail) {
            return done(new Error('Google account did not return an email address.'));
          }

          const user = await findOrCreateSocialUser({
            provider: 'google',
            providerId: String(profile.id),
            email: primaryEmail
          });

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

function configureGithubStrategy() {
  const clientID = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    return;
  }

  const callbackURL =
    process.env.GITHUB_CALLBACK_URL ||
    `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/github/callback`;

  passport.use(
    new GitHubStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ['user:email']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const verifiedEmails = Array.isArray(profile.emails)
            ? profile.emails.filter((entry) => entry && entry.value)
            : [];

          const preferredEmail = verifiedEmails.find((entry) => entry.primary) || verifiedEmails[0];
          let email = preferredEmail && preferredEmail.value
            ? preferredEmail.value.toLowerCase()
            : null;

          if (!email && profile && profile._json && typeof profile._json.email === 'string') {
            email = profile._json.email.toLowerCase();
          }

          if (!email) {
            const normalizedUsername =
              typeof profile.username === 'string' && profile.username.trim()
                ? profile.username.trim().toLowerCase()
                : 'github-user';
            email = `${normalizedUsername}+${String(profile.id)}@users.noreply.github.com`;
          }

          const user = await findOrCreateSocialUser({
            provider: 'github',
            providerId: String(profile.id),
            email
          });

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

function configurePassport() {
  configureGoogleStrategy();
  configureGithubStrategy();
}

module.exports = configurePassport;

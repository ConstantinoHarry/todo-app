function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login?error=' + encodeURIComponent('Please login to continue.'));
  }

  return next();
}

function requireGuest(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  return next();
}

module.exports = {
  requireAuth,
  requireGuest
};

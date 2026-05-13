const { verifyJwt } = require('../auth');

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }

  try {
    req.user = verifyJwt(token);
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function checkRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    return next();
  };
}

function requireTenant(req, res, next) {
  if (!req.user || !req.user.tenant_id) {
    return res.status(403).json({ message: 'Forbidden: tenant context is required' });
  }

  return next();
}

module.exports = {
  verifyToken,
  checkRole,
  requireTenant
};

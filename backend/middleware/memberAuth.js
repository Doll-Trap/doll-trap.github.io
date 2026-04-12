const jwt = require('jsonwebtoken');

const memberAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'member') return res.status(401).json({ error: 'Not a member token' });
    req.member = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = memberAuth;

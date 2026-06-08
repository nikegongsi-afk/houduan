const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { userRateLimit } = require('./middleware/rateLimiter');

dotenv.config();

if (process.env.DISABLE_LOCAL_FS !== 'true') {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('临时文件目录已创建:', tempDir);
  }
}

const app = express();

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// 上传接口不参与限流（大文件上传耗时较长）
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/upload')) {
    return next();
  }
  return userRateLimit()(req, res, next);
});

if (process.env.NODE_ENV === 'development') {
  app.use('/api/static', express.static(path.join(__dirname, 'public')));
}

const handleError = (res, error, message = '操作失败') => {
  console.error(message, error);
  res.status(500).json({ success: false, message });
};

const formatDatetime = (datetime) => {
  if (!datetime) return null;
  return new Date(datetime).toISOString();
};

global.handleError = handleError;
global.formatDatetime = formatDatetime;

const usersRoutes = require('./routes/usersRoutes');
const tradesRoutes = require('./routes/tradesRoutes');
const announcementsRoutes = require('./routes/announcementsRoutes');
const traderProfilesRoutes = require('./routes/traderProfilesRoutes');
const aiStockPickerRoutes = require('./routes/aiStockPickerRoutes');
const avatarsRoutes = require('./routes/avatarsRoutes');
const contactRecordsRoutes = require('./routes/contactRecordsRoutes');
const dailyLikesRoutes = require('./routes/dailyLikesRoutes');
const documentsRoutes = require('./routes/documentsRoutes');
const leaderboardTradersRoutes = require('./routes/leaderboardTradersRoutes');
const likeRecordsRoutes = require('./routes/likeRecordsRoutes');
const membershipLevelsRoutes = require('./routes/membershipLevelsRoutes');
const membershipPointsRulesRoutes = require('./routes/membershipPointsRulesRoutes');
const tradeMarketRoutes = require('./routes/tradeMarketRoutes');
const trades1Routes = require('./routes/trades1Routes');
const tradingStrategiesRoutes = require('./routes/tradingStrategiesRoutes');
const videosRoutes = require('./routes/videosRoutes');
const vipAnnouncementsRoutes = require('./routes/vipAnnouncementsRoutes');
const vipTradesRoutes = require('./routes/vipTradesRoutes');
const visitStatsRoutes = require('./routes/visitStatsRoutes');
const pageVisitsRoutes = require('./routes/pageVisitsRoutes');
const whatsappAgentsRoutes = require('./routes/whatsappAgentsRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const indexRoutes = require('./routes/web/webindexRoutes');
const loginRoutes = require('./routes/web/webloginRoutes');
const vipRoutes = require('./routes/web/webvipRoutes');
const webaiRoutes = require('./routes/web/webaiRoutes');
const invitationCodeRoutes = require('./routes/invitationCodeRoutes');
const webvideoRoutes = require('./routes/web/webvideoRoutes');
const testGptRoutes = require('./routes/web/testGptRoutes');
const usersviewRoutes = require('./routes/usersviewRoutes');
const userStatisticsRoutes = require('./routes/userStatisticsRoutes');
const questionBankRoutes = require('./routes/questionBankRoutes');
const webdocumentRoutes = require('./routes/web/webdocumentRoutes');
const partnerOrganizationsRoutes = require('./routes/partnerOrganizationsRoutes');
const paymentRecordsRoutes = require('./routes/paymentRecordsRoutes');

app.use('/api/users', usersRoutes);
app.use('/api/user-statistics', userStatisticsRoutes);
app.use('/api/usersview', usersviewRoutes);
app.use('/api/question-bank', questionBankRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/trader-profiles', traderProfilesRoutes);
app.use('/api/ai-stock-picker', aiStockPickerRoutes);
app.use('/api/avatars', avatarsRoutes);
app.use('/api/contact-records', contactRecordsRoutes);
app.use('/api/daily-likes', dailyLikesRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/leaderboard-traders', leaderboardTradersRoutes);
app.use('/api/like-records', likeRecordsRoutes);
app.use('/api/membership-levels', membershipLevelsRoutes);
app.use('/api/membership-points-rules', membershipPointsRulesRoutes);
app.use('/api/trade-market', tradeMarketRoutes);
app.use('/api/trades1', trades1Routes);
app.use('/api/trading-strategies', tradingStrategiesRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/vip-announcements', vipAnnouncementsRoutes);
app.use('/api/vip-trades', vipTradesRoutes);
app.use('/api/visit-stats', visitStatsRoutes);
app.use('/api/page-visits', pageVisitsRoutes);
app.use('/api/whatsapp-agents', whatsappAgentsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/web', indexRoutes);
app.use('/api/web/login', loginRoutes);
app.use('/api/web/vip', vipRoutes);
app.use('/api/web/ai', webaiRoutes);
app.use('/api/invitation-code', invitationCodeRoutes);
app.use('/api/web/videos', webvideoRoutes);
app.use('/api/partner-organizations', partnerOrganizationsRoutes);
app.use('/api/payment-records', paymentRecordsRoutes);
app.use('/api/web/documents', webdocumentRoutes);
app.use('/api/web/test-gpt', testGptRoutes);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Trading Platform API is running',
    env: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: '上传内容过大，请分批导入或减少单次题目数量',
    });
  }
  res.status(500).json({ success: false, message: err.message || 'Server Error' });
});

module.exports = app;

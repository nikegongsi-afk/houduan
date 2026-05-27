const app = require('./app');
const { initScheduler } = require('./scheduler');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);

  if (process.env.DISABLE_SCHEDULER !== 'true') {
    try {
      initScheduler();
    } catch (error) {
      console.error('Failed to initialize scheduler:', error);
    }
  }
});

module.exports = app;

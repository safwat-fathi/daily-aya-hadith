module.exports = {
  apps: [
    {
      name: 'slack-bot-aya-hadith',
      script: 'dist/main.js',
      instances: 1, // Keep at 1 instance for a Slack Socket Mode bot to avoid connection conflicts
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

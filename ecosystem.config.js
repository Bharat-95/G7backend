module.exports = {
  apps: [
    {
      name: 'G7backend',
      script: 'index.js',
      watch: true,
      ignore_watch: ["node_modules", "uploads"], // Ignore certain directories from watching for changes
      watch_options: {
        followSymlinks: false,
      },
      env: {
	NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};


const envMap = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_AUTH_DOMAIN",
  databaseURL: "FIREBASE_DATABASE_URL",
  projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID",
  appId: "FIREBASE_APP_ID"
};

module.exports = (_request, response) => {
  const config = Object.fromEntries(
    Object.entries(envMap)
      .map(([key, envName]) => [key, process.env[envName] || ""])
      .filter(([, value]) => value)
  );

  response.setHeader("Content-Type", "application/javascript; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`window.__FIREBASE_CONFIG__ = ${JSON.stringify(config)};`);
};

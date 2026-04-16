import { config } from "dotenv";
config();

function require(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export default {
  port: process.env.PORT || 3001,
  allowedOrigin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",

  clerk: {
    publishableKey: require("CLERK_PUBLISHABLE_KEY"),
    secretKey: require("CLERK_SECRET_KEY"),
  },

  elation: {
    clientId: require("ELATION_CLIENT_ID"),
    clientSecret: require("ELATION_CLIENT_SECRET"),
    baseUrl: process.env.ELATION_BASE_URL || "https://sandbox.elationemr.com",
    tokenUrl: process.env.ELATION_TOKEN_URL || "https://sandbox.elationemr.com/api/2.0/oauth2/token/",
  },

  hint: {
    apiKey: process.env.HINT_API_KEY || "",
  },

  ghl: {
    apiKey: process.env.GHL_API_KEY || "",
  },

  ringcentral: {
    clientId:     process.env.RC_CLIENT_ID     || "",
    clientSecret: process.env.RC_CLIENT_SECRET || "",
    jwtToken:     process.env.RC_JWT_TOKEN     || "",   // método 1: JWT Grant
    username:     process.env.RC_USERNAME      || "",   // método 2: Password Grant
    password:     process.env.RC_PASSWORD      || "",   // método 2: Password Grant
  },
};

import { config } from "../config.ts";

/**
 * JWT token structure
 */
interface JWTPayload {
  username: string;
  exp: number; // Expiration timestamp
}

/**
 * Simple JWT implementation for authentication
 * In production, consider using a library like djwt
 */
export class AuthService {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * Create a JWT token for a user
   */
  async createToken(username: string, expiryHours: number = 24): Promise<string> {
    const payload: JWTPayload = {
      username,
      exp: Date.now() + expiryHours * 60 * 60 * 1000,
    };

    // Simple base64 encoding (for production, use proper JWT signing)
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadEncoded = btoa(JSON.stringify(payload));
    const signature = await this.sign(`${header}.${payloadEncoded}`);

    return `${header}.${payloadEncoded}.${signature}`;
  }

  /**
   * Verify and decode a JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      const [header, payload, signature] = parts;
      const expectedSignature = await this.sign(`${header}.${payload}`);

      if (signature !== expectedSignature) {
        return null;
      }

      const decoded: JWTPayload = JSON.parse(atob(payload));

      // Check expiration
      if (decoded.exp < Date.now()) {
        return null;
      }

      return decoded;
    } catch (error) {
      console.error("Token verification error:", error);
      return null;
    }
  }

  /**
   * Create a signature for the token
   */
  private async sign(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secret);
    const dataToSign = encoder.encode(data);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", key, dataToSign);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }
}

/**
 * Middleware to verify authentication token
 */
export async function requireAuth(req: Request): Promise<Response | null> {
  // Skip auth in local environment
  if (config.server.environment === "local") {
    return null;
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = authHeader.substring(7);
  const authService = new AuthService(config.auth.jwtSecret);
  const payload = await authService.verifyToken(token);

  if (!payload) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Token is valid, allow request to proceed
  return null;
}

/**
 * Middleware to verify webhook bearer token
 */
export function requireWebhookAuth(req: Request): Response | null {
  // Skip auth in local environment
  if (config.server.environment === "local") {
    return null;
  }

  const authHeader = req.headers.get("Authorization");
  const expectedToken = `Bearer ${config.webhook.secret}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.warn("Unauthorized webhook request attempt");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

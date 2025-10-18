import { config } from "../config.ts";
import { AuthService } from "../middleware/auth.ts";

/**
 * Handle authentication routes
 */
export async function handleAuthRoutes(
  req: Request,
  pathname: string
): Promise<Response> {
  // Login endpoint
  if (pathname === "/api/auth/login" && req.method === "POST") {
    try {
      const body = await req.json();
      const { username, password } = body;

      // Validate credentials against environment variables
      if (
        username === config.auth.username &&
        password === config.auth.password
      ) {
        const authService = new AuthService(config.auth.jwtSecret);
        const token = await authService.createToken(
          username,
          config.auth.jwtExpiryHours
        );

        return new Response(
          JSON.stringify({
            success: true,
            token,
            username,
            expiresIn: config.auth.jwtExpiryHours * 60 * 60 * 1000,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid credentials" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  // Logout endpoint (client-side will clear token, this just acknowledges)
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify token endpoint (useful for checking if user is still authenticated)
  if (pathname === "/api/auth/verify" && req.method === "GET") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ valid: false }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.substring(7);
    const authService = new AuthService(config.auth.jwtSecret);
    const payload = await authService.verifyToken(token);

    if (payload) {
      return new Response(
        JSON.stringify({ valid: true, username: payload.username }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({ valid: false }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

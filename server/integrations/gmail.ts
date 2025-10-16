import { Integration } from "./base.ts";
import { config } from "../config.ts";

export class GmailIntegration extends Integration {
  name = "gmail";
  requiredEnvVars = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_USER_EMAIL"];

  async validate(): Promise<boolean> {
    console.log("[Gmail] Validating integration...");
    const envCheck = this.checkEnvVars();
    if (!envCheck.valid) {
      console.log("[Gmail] ❌ Environment variables not set");
      return false;
    }

    // Actually test the credentials by attempting to get an access token
    try {
      console.log("[Gmail] Testing OAuth credentials...");
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: config.gmail.clientId,
          client_secret: config.gmail.clientSecret,
          refresh_token: config.gmail.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (tokenResponse.ok) {
        console.log("[Gmail] ✅ Connected successfully");
      } else {
        const errorText = await tokenResponse.text();
        console.log(`[Gmail] ❌ OAuth error: ${tokenResponse.status} - ${errorText}`);
      }
      return tokenResponse.ok;
    } catch (error) {
      console.error("[Gmail] ❌ Validation error:", error);
      return false;
    }
  }

  // Get access token from refresh token
  private async getAccessToken(): Promise<string> {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.gmail.clientId,
        client_secret: config.gmail.clientSecret,
        refresh_token: config.gmail.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get Gmail access token: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  }

  // Create a draft email
  async execute(outputConfig: any): Promise<any> {
    const { 
      to, 
      subject, 
      body, 
      contentType = "text/plain" 
    } = outputConfig;

    if (!to || !subject || !body) {
      throw new Error("Gmail integration requires 'to', 'subject', and 'body' in config");
    }

    const accessToken = await this.getAccessToken();

    // Construct MIME message
    const messageParts = [
      `To: ${to}`,
      `From: ${config.gmail.userEmail}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      "",
      body,
    ];

    const message = messageParts.join("\r\n");
    
    // Encode message in base64url format
    const encodedMessage = btoa(message)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Create draft via Gmail API
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          raw: encodedMessage,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    return {
      draftId: data.id,
      messageId: data.message?.id,
      timestamp: new Date().toISOString(),
    };
  }

  // Send email directly (not as draft)
  async sendEmail(outputConfig: any): Promise<any> {
    const { 
      to, 
      subject, 
      body, 
      contentType = "text/plain" 
    } = outputConfig;

    if (!to || !subject || !body) {
      throw new Error("Gmail integration requires 'to', 'subject', and 'body' in config");
    }

    const accessToken = await this.getAccessToken();

    // Construct MIME message
    const messageParts = [
      `To: ${to}`,
      `From: ${config.gmail.userEmail}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      "",
      body,
    ];

    const message = messageParts.join("\r\n");
    
    // Encode message in base64url format
    const encodedMessage = btoa(message)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send email via Gmail API
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    return {
      messageId: data.id,
      threadId: data.threadId,
      timestamp: new Date().toISOString(),
    };
  }

  getConfigSchema(): object {
    return {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
          required: true,
        },
        subject: {
          type: "string",
          description: "Email subject line",
          required: true,
        },
        body: {
          type: "string",
          description: "Email body content",
          required: true,
        },
        contentType: {
          type: "string",
          description: "Content type (text/plain or text/html)",
          default: "text/plain",
          enum: ["text/plain", "text/html"],
        },
      },
    };
  }
}

export const gmailIntegration = new GmailIntegration();

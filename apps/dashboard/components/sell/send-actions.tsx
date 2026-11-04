"use client";

import { useState } from "react";
import { Copy, ExternalLink, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * How a message leaves AgencyOS: always by Matthias's own hand.
 * WhatsApp → wa.me link with text pre-filled; email → mailto (Gmail API once connected); DM → copy + open the page.
 */
export function SendActions({ channel, waHref, email, subject, body, pageUrl }: { channel: string; waHref?: string | null; email?: string | null; subject?: string; body: string; pageUrl?: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the text is visible to copy by hand */
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {channel === "whatsapp" && waHref ? (
        <Button asChild size="sm">
          <a href={waHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> Open in WhatsApp
          </a>
        </Button>
      ) : null}
      {channel === "email" && email ? (
        <Button asChild size="sm">
          <a href={`mailto:${email}?subject=${encodeURIComponent(subject ?? "")}&body=${encodeURIComponent(body)}`}>
            <Mail /> Open email
          </a>
        </Button>
      ) : null}
      {channel === "dm" && pageUrl ? (
        <Button asChild size="sm">
          <a href={pageUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Open page
          </a>
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={copy}>
        <Copy /> {copied ? "Copied" : "Copy text"}
      </Button>
    </div>
  );
}

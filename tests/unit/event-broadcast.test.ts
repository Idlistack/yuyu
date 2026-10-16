import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { broadcastRecipientWhere, resolveBroadcastRecipients, rsvpMatchesBroadcastAudience, sanitizeBroadcastHtml } from "@/lib/eventBroadcast";

describe("broadcast audience selection", () => {
  it("builds a tenant-scoped predicate for each attendance filter", () => {
    expect(broadcastRecipientWhere("event_1", { statuses: ["CONFIRMED", "WAITLISTED"], attendance: "ANY" })).toEqual({
      eventId: "event_1",
      status: { in: ["CONFIRMED", "WAITLISTED"] },
    });
    expect(broadcastRecipientWhere("event_1", { statuses: ["CONFIRMED"], attendance: "CHECKED_IN" })).toEqual({
      eventId: "event_1",
      status: { in: ["CONFIRMED"] },
      checkedInAt: { not: null },
    });
    expect(broadcastRecipientWhere("event_1", { statuses: ["CONFIRMED"], attendance: "NOT_CHECKED_IN" })).toEqual({
      eventId: "event_1",
      status: { in: ["CONFIRMED"] },
      checkedInAt: null,
    });
  });

  it("re-evaluates membership of the audience at delivery time", () => {
    const audience = { statuses: ["CONFIRMED" as const], attendance: "NOT_CHECKED_IN" as const };
    expect(rsvpMatchesBroadcastAudience({ status: "CONFIRMED", checkedInAt: null }, audience)).toBe(true);
    expect(rsvpMatchesBroadcastAudience({ status: "CONFIRMED", checkedInAt: new Date() }, audience)).toBe(false);
    expect(rsvpMatchesBroadcastAudience({ status: "REJECTED", checkedInAt: null }, audience)).toBe(false);
    expect(rsvpMatchesBroadcastAudience({ status: "WAITLISTED", checkedInAt: null }, { statuses: ["WAITLISTED"], attendance: "ANY" })).toBe(true);
  });

  it("sends one email per address and prefers the account email over a guest email", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "rsvp_1", guestEmail: "Person@Example.test", user: null },
      { id: "rsvp_2", guestEmail: null, user: { email: "person@example.test" } },
      { id: "rsvp_3", guestEmail: "other@example.test", user: { email: "account@example.test" } },
      { id: "rsvp_4", guestEmail: null, user: { email: null } },
      { id: "rsvp_5", guestEmail: "   ", user: null },
    ]);
    const client = { rSVP: { findMany } } as unknown as Parameters<typeof resolveBroadcastRecipients>[0];

    const recipients = await resolveBroadcastRecipients(client, "event_1", { statuses: ["CONFIRMED"], attendance: "ANY" });

    expect(recipients).toEqual([
      { rsvpId: "rsvp_1", email: "person@example.test" },
      { rsvpId: "rsvp_3", email: "account@example.test" },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "event_1", status: { in: ["CONFIRMED"] } },
      select: { id: true, status: true, guestEmail: true, user: { select: { email: true } } },
    }));
  });

  it("uses a person's confirmed registration so their email carries the ticket link", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "rsvp_waitlisted", status: "WAITLISTED", guestEmail: "person@example.test", user: null },
      { id: "rsvp_other", status: "WAITLISTED", guestEmail: "other@example.test", user: null },
      { id: "rsvp_confirmed", status: "CONFIRMED", guestEmail: null, user: { email: "Person@example.test" } },
      { id: "rsvp_later", status: "CONFIRMED", guestEmail: "person@example.test", user: null },
    ]);
    const client = { rSVP: { findMany } } as unknown as Parameters<typeof resolveBroadcastRecipients>[0];

    const recipients = await resolveBroadcastRecipients(client, "event_1", { statuses: ["CONFIRMED", "WAITLISTED"], attendance: "ANY" });

    expect(recipients).toEqual([
      { rsvpId: "rsvp_confirmed", email: "person@example.test" },
      { rsvpId: "rsvp_other", email: "other@example.test" },
    ]);
  });
});

describe("broadcast HTML sanitising", () => {
  it("keeps the supported subset, button classes, and link placeholders", () => {
    const html = '<h2>Hi</h2><p>Hello <strong>{{name}}</strong>, <em>welcome</em>.</p><ul><li>One</li></ul><blockquote><p>Quote</p></blockquote><p><a class="cta" href="{{ticketLink}}" target="_blank" rel="noopener">Ticket</a> <a href="{{scheduleUrl}}">Agenda</a> <a href="https://example.test/x" class="other">Site</a></p>';
    expect(sanitizeBroadcastHtml(html)).toBe('<h2>Hi</h2><p>Hello <strong>{{name}}</strong>, <em>welcome</em>.</p><ul><li>One</li></ul><blockquote><p>Quote</p></blockquote><p><a class="cta" href="{{ticketLink}}">Ticket</a> <a href="{{scheduleUrl}}">Agenda</a> <a href="https://example.test/x">Site</a></p>');
  });

  it("strips scripts, event handlers, styles, images, and unsafe link schemes", () => {
    const html = '<p onclick="x()" style="color:red">Hi<script>alert(1)</script><img src="x" onerror="alert(1)"></p><p><a href="javascript:alert(1)">bad</a><a href="{{nope}}">unknown</a></p><iframe src="https://evil.test"></iframe>';
    const clean = sanitizeBroadcastHtml(html);
    expect(clean).toBe("<p>Hi</p><p><a>bad</a><a>unknown</a></p>");
  });

  it("keeps links whose scheme is written in capitals", () => {
    expect(sanitizeBroadcastHtml('<p><a href="HTTPS://Example.test/x">Site</a> <a href="MailTo:hi@example.test">Mail</a> <a href="{{TicketLink}}">Bad</a></p>'))
      .toBe('<p><a href="HTTPS://Example.test/x">Site</a> <a href="MailTo:hi@example.test">Mail</a> <a>Bad</a></p>');
  });
});

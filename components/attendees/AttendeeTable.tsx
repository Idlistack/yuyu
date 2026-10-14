"use client";

import { useMemo, useState, useTransition } from "react";
import type { RsvpStatus } from "@prisma/client";
import { ChevronLeft, ChevronRight, Copy, MessageSquareText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Callout, Chip, EmptyState, type ChipTone } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { NativeSelect, SearchInput } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { deleteRsvp, restoreRsvp } from "@/app/actions/rsvp-admin";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import {
  approveRsvp,
  promoteFromWaitlist,
  rejectRsvp,
} from "@/app/actions/rsvp-lifecycle";
import { useToast } from "@/components/feedback/ToastProvider";
import { useRouter } from "next/navigation";
import { EditRsvpDialog } from "@/components/attendees/EditRsvpDialog";
import type { ManualRsvpField } from "@/components/attendees/ManualRsvpDialog";
import { ExportEmailsButton } from "@/components/attendees/ExportEmailsButton";

export type AttendeeRow = {
  id: string;
  status: RsvpStatus;
  createdAt: string;
  guestEmail: string | null;
  guestName?: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
  checkedInAt: string | null;
  ticketUrl: string;
  answers?: { label: string; value: string }[];
  rawAnswers?: Array<{
    fieldId: string;
    valueText?: string | null;
    valueBool?: boolean | null;
    valueNumber?: number | null;
    valueDate?: string | null;
  }>;
  registrationFields?: ManualRsvpField[];
};

type FilterKind = "all" | "guests" | "users";
type StatusFilter = "all" | RsvpStatus;

const statusTones: Partial<Record<RsvpStatus, ChipTone>> = {
  CONFIRMED: "success",
  WAITLISTED: "warning",
  PENDING_APPROVAL: "warning",
  REJECTED: "danger",
};

function statusLabel(s: RsvpStatus) {
  switch (s) {
    case "CONFIRMED":
      return "Confirmed";
    case "WAITLISTED":
      return "Waitlisted";
    case "PENDING_APPROVAL":
      return "Pending";
    case "REJECTED":
      return "Rejected";
    default:
      return s;
  }
}

export function AttendeeTable(props: {
  organisationSlug: string;
  eventId?: string;
  eventInstanceId?: string;
  attendees: AttendeeRow[];
  canManage: boolean;
  registrationFields?: ManualRsvpField[];
  eventTitle?: string;
  collectionTruncated?: boolean;
}) {
  const {
    organisationSlug,
    eventId,
    eventInstanceId,
    attendees,
    canManage,
    registrationFields = [],
    eventTitle,
    collectionTruncated = false,
  } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [pending, startTransition] = useTransition();
  const [answersOpen, setAnswersOpen] = useState(false);
  const [answersTitle, setAnswersTitle] = useState<string>("");
  const [answersRows, setAnswersRows] = useState<
    { label: string; value: string }[]
  >([]);
  const [deleteConfirmAttendee, setDeleteConfirmAttendee] =
    useState<AttendeeRow | null>(null);
  const [editAttendee, setEditAttendee] = useState<AttendeeRow | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendees.filter((a) => {
      if (filter === "guests" && a.user) return false;
      if (filter === "users" && !a.user) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;
      const name = (a.user?.name ?? a.guestName ?? "").toLowerCase();
      const email = (a.user?.email ?? a.guestEmail ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [attendees, search, filter, statusFilter]);
  const pageRows = rows.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  function targetPayload() {
    if (eventId) return { eventId };
    if (eventInstanceId) return { eventInstanceId };
    return {};
  }

  function runLifecycle(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      showToast(success, "success");
      router.refresh();
    });
  }

  if (attendees.length === 0) {
    return <EmptyState mood="sleepy" title="No RSVPs yet." />;
  }

  const firstShown = rows.length === 0 ? 0 : page * rowsPerPage + 1;
  const lastShown = Math.min(rows.length, (page + 1) * rowsPerPage);
  const lastPage = Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1);

  return (
    <div className="flex flex-col gap-4">
      {collectionTruncated ? (
        <Callout tone="warning">
          Only the 250 most recent registrations are loaded in this browser
          view.
        </Callout>
      ) : null}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <label htmlFor="attendee-search" className="sr-only">Search name or email</label>
        <div className="sm:w-[320px]">
        <SearchInput
          id="attendee-search"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          onClear={() => {
            setSearch("");
            setPage(0);
          }}
        />
        </div>
        <label className="sr-only" htmlFor="attendee-type">Type</label>
        <div className="sm:w-[180px]">
        <NativeSelect
          id="attendee-type"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as FilterKind);
            setPage(0);
          }}
        >
          <option value="all">All</option>
          <option value="guests">Guests only</option>
          <option value="users">Signed-in users</option>
        </NativeSelect>
        </div>
        <label className="sr-only" htmlFor="attendee-status">Status</label>
        <div className="sm:w-[180px]">
        <NativeSelect
          id="attendee-status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(0);
          }}
        >
          <option value="all">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="WAITLISTED">Waitlisted</option>
          <option value="PENDING_APPROVAL">Pending approval</option>
          <option value="REJECTED">Rejected</option>
        </NativeSelect>
        </div>
        {eventTitle ? (
          <ExportEmailsButton eventTitle={eventTitle} attendees={rows} />
        ) : null}
      </div>
      <Table label="Attendees" className="sm:min-w-[720px]">
        <THead>
          <tr>
            <TH>Name</TH>
            <TH className="hidden sm:table-cell">Answers</TH>
            <TH className="hidden sm:table-cell">Status</TH>
            <TH className="hidden sm:table-cell">Check-in</TH>
            <TH className="hidden sm:table-cell">RSVP time</TH>
            {canManage ? <TH className="text-right">Actions</TH> : null}
          </tr>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={canManage ? 6 : 5} className="text-ink-muted">
                No matches.
              </TD>
            </TR>
          ) : (
            pageRows.map((a) => {
              const email = a.user?.email ?? a.guestEmail ?? "—";
              const guestDisplayName =
                a.guestName?.trim() ||
                (a.guestEmail ? a.guestEmail.split("@")[0] : "") ||
                "Guest";
              const name = a.user?.name ?? (a.user ? "—" : guestDisplayName);
              const ts = new Date(a.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
              const answerCount = a.answers?.length ?? 0;
              const statusChip = <Chip size="sm" tone={statusTones[a.status] ?? "neutral"}>{statusLabel(a.status)}</Chip>;
              return (
                <TR key={a.id}>
                  <TD className="max-w-[160px] sm:max-w-[240px]">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="truncate text-caption text-ink-muted">{email}</p>
                    <div className="mt-1 sm:hidden">{statusChip}</div>
                  </TD>
                  <TD className="hidden sm:table-cell">
                    {answerCount > 0 ? (
                      <Button
                        size="sm"
                        variant="quiet"
                        startIcon={<MessageSquareText />}
                        aria-label={`View answers (${answerCount})`}
                        title={`View answers (${answerCount})`}
                        onClick={() => {
                          setAnswersTitle(name);
                          setAnswersRows(a.answers ?? []);
                          setAnswersOpen(true);
                        }}
                      >
                        {answerCount}
                      </Button>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </TD>
                  <TD className="hidden sm:table-cell">{statusChip}</TD>
                  <TD className="hidden sm:table-cell">
                    {a.checkedInAt ? (
                      <Chip size="sm" tone="success">
                        {new Date(a.checkedInAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </Chip>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </TD>
                  <TD className="hidden whitespace-nowrap text-ink-secondary sm:table-cell">{ts}</TD>
                  {canManage ? (
                    <TD className="text-right">
                      <div className="flex flex-col items-end justify-end gap-1 sm:flex-row sm:flex-nowrap sm:items-center">
                        {a.status === "PENDING_APPROVAL" ? (
                          <>
                            <Button size="sm" variant="secondary" disabled={pending} onClick={() => runLifecycle(() => approveRsvp({ organisationSlug, rsvpId: a.id, ...targetPayload() }), "Approved")}>
                              Approve
                            </Button>
                            <Button size="sm" variant="danger" disabled={pending} onClick={() => runLifecycle(() => rejectRsvp({ organisationSlug, rsvpId: a.id, ...targetPayload() }), "Rejected")}>
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {a.status === "WAITLISTED" ? (
                          <>
                            <Button size="sm" variant="secondary" disabled={pending} onClick={() => runLifecycle(() => promoteFromWaitlist({ organisationSlug, rsvpId: a.id, ...targetPayload() }), "Promoted")}>
                              Promote
                            </Button>
                            <Button size="sm" variant="danger" disabled={pending} onClick={() => runLifecycle(() => rejectRsvp({ organisationSlug, rsvpId: a.id, ...targetPayload() }), "Rejected")}>
                              Reject
                            </Button>
                          </>
                        ) : null}
                        <Menu>
                          <MenuTrigger asChild>
                            <IconButton size="sm" label={`More actions for ${name}`} disabled={pending}>
                              <MoreHorizontal />
                            </IconButton>
                          </MenuTrigger>
                          <MenuContent>
                            <MenuItem
                              icon={<Copy />}
                              onSelect={async () => {
                                try {
                                  await navigator.clipboard.writeText(a.ticketUrl);
                                  showToast("Ticket link copied", "success");
                                } catch {
                                  showToast("Could not copy", "error");
                                }
                              }}
                            >
                              Copy ticket link
                            </MenuItem>
                            <MenuItem icon={<Pencil />} onSelect={() => setEditAttendee(a)}>
                              {a.user ? "View registration" : "Edit registration or transfer ticket"}
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleteConfirmAttendee(a)}>
                              Remove RSVP
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </div>
                    </TD>
                  ) : null}
                </TR>
              );
            })
          )}
        </TBody>
      </Table>
      <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm text-ink-secondary">
        <label className="flex items-center gap-2">
          Attendees per page
          <div className="w-[88px]">
          <NativeSelect
            value={rowsPerPage}
            onChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
            className="min-h-9 py-1"
          >
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </NativeSelect>
          </div>
        </label>
        <span aria-live="polite">{firstShown}–{lastShown} of {rows.length}</span>
        <div className="flex">
          <IconButton size="sm" label="Previous page" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft /></IconButton>
          <IconButton size="sm" label="Next page" disabled={page >= lastPage} onClick={() => setPage((current) => Math.min(lastPage, current + 1))}><ChevronRight /></IconButton>
        </div>
      </div>

      <Dialog open={answersOpen} onOpenChange={setAnswersOpen}>
        <DialogContent size="md">
          <DialogHeader title={`Answers · ${answersTitle}`} />
          <DialogBody>
            {answersRows.length === 0 ? (
              <p className="text-body-ui text-ink-muted">No answers.</p>
            ) : (
              <dl className="flex flex-col gap-3">
                {answersRows.map((r) => (
                  <div key={r.label}>
                    <dt className="text-caption text-ink-muted">{r.label}</dt>
                    <dd className="whitespace-pre-wrap text-body-ui text-ink">{r.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAnswersOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteConfirmAttendee}
        title="Remove Attendee"
        message={`Are you sure you want to remove ${
          deleteConfirmAttendee?.user?.name ??
          deleteConfirmAttendee?.guestName ??
          deleteConfirmAttendee?.guestEmail ??
          "this attendee"
        }'s RSVP registration?`}
        confirmLabel="Remove"
        loading={pending}
        onCancel={() => setDeleteConfirmAttendee(null)}
        onConfirm={() => {
          if (!deleteConfirmAttendee) return;
          const targetAttendee = { ...deleteConfirmAttendee };
          setDeleteConfirmAttendee(null);
          startTransition(async () => {
            const res = await deleteRsvp({
              organisationSlug,
              rsvpId: targetAttendee.id,
              ...targetPayload(),
            });
            if (!res.ok) {
              showToast(res.error, "error");
            } else {
              // 10 second undo popup toast!
              showToast(
                "Attendee removed",
                "success",
                {
                  label: "Undo",
                  onClick: () => {
                    startTransition(async () => {
                      const restoreRes = await restoreRsvp({
                        organisationSlug,
                        undoId: res.data!.undoId,
                      });
                      if (restoreRes.ok) {
                        showToast("Attendee restored", "success");
                        router.refresh();
                      } else {
                        showToast(restoreRes.error, "error");
                      }
                    });
                  },
                },
                10000, // 10 seconds duration
              );
              router.refresh();
            }
          });
        }}
      />
      {editAttendee ? (
        <EditRsvpDialog
          organisationSlug={organisationSlug}
          eventId={eventId}
          eventInstanceId={eventInstanceId}
          attendee={editAttendee}
          fields={registrationFields}
          onClose={() => setEditAttendee(null)}
          onUpdated={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

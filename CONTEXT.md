# Domain context

## Skyway Simulation

The browser-independent, deterministic rules for one Skyway Sprint round. It
contains fixed-step player locomotion plus the Skyway Course State. Rendering,
input collection, bots, results, rewards, persistence, and networking are
adapters outside this module.

## Skyway Course State

The serializable clock and race state for Skyway Sprint: phase, elapsed race
time, platform timing, sweepers, sliding walls, participant hazard responses,
checkpoints, fall recovery, placement, and the finish transition.

## Skyway Round

The deterministic fixed-tick scheduler that orders the Skyway Course State,
validated participant input, locomotion, and participant course transitions.
It owns participant initial/replay spawns, race reset state, and restorable
versioned snapshots. It also owns the fixed-tick pre-race countdown and start
transition; countdown DOM, sound, and instruction handoff are presentation
adapters.
Input decisions, bots, results, rewards, persistence, and networking remain
adapters outside the scheduler.

## Skyway Input Timeline

The fixed-capacity, tick-indexed command buffer consumed by Skyway Round. It
normalizes and copies accepted input, uses neutral input when a participant is
missing, rejects late and out-of-window commands, and resolves duplicates with
first-write-wins. Input collection and transport are adapters outside this
module.

## Skyway Snapshot History

The opt-in fixed-capacity ring of canonical Skyway Round snapshots used for
exact tick lookup, rollback, and deterministic resimulation. Each stored
snapshot has a stable FNV-1a-64 content hash for replay comparison; the hash is
non-cryptographic and is not proof of trust or identity. The ring carries a
monotonic lifecycle round epoch, and every tick lookup or mutation requires the
caller's exact epoch so prior-round same-tick work fails closed. Live
rendering, transport, and persistence do not consume this module.

## Skyway Command Journal

The opt-in fixed-capacity ring of commands actually accepted for each ordered
participant and timeline tick. Commands retain neutral, predicted, or
authoritative provenance. A retained command may only be replaced by strictly
higher authority, and retained ranges can reconstruct an empty Input Timeline
for rollback resimulation. The ring carries the same lifecycle round epoch as
Snapshot History, and all tick operations require that exact epoch. Authority
labels are trusted caller assertions in this local foundation; they are not
authenticated identities or network proof.

## Skyway Rollback Coordinator

The pure opt-in coordinator that atomically restores a retained Skyway Round
snapshot, truncates its Snapshot History, and reconstructs its Input Timeline
from the Command Journal. It rejects misaligned heads, participants, capacities,
coverage, or occupied restoration ranges before mutation and returns a
presentation-suppression envelope for the caller's resimulation loop. It
requires Snapshot History and Command Journal to match the caller's lifecycle
round epoch and binds that epoch into the envelope. UI, results, rewards,
persistence, transport, and authority decisions remain adapters outside this
module.

## Skyway Replay Event Ledger

The pure opt-in tick-indexed ledger that stages deterministic Skyway Round
events, replaces an entirely uncommitted rollback window during resimulation,
and releases one ordered immutable event commit to presentation, results,
reward, or persistence adapters. Empty-event ticks are retained as coverage,
repeated commits are idempotent, and rollback across an already committed tick
is rejected because external side effects cannot be undone. Commit finality is
a trusted caller assertion in this local foundation, not authenticated network
authority.

## Skyway Round Finality

The pure opt-in token that binds one caller-asserted finality decision to a
Round epoch, exact Round snapshot hash, staged event-ledger revision, and
through-tick. The Replay Event Ledger advances its epoch monotonically on reset
and requires a current token for resimulation replacement and commit, so work
from a prior round or earlier staged revision is rejected. Token hashes use the
same non-cryptographic canonical hash as Snapshot History and are correlation
evidence, not authentication or proof of server authority.

## Skyway Round Lifecycle

The pure opt-in transaction that verifies one aligned Round, Snapshot History,
Command Journal, and Replay Event Ledger head and caller epoch, then resets them
as one lifecycle change. It rotates all three sidecar epochs in lockstep, clears
command and event coverage, resets the Round through its existing semantics,
and seeds Snapshot History with the new canonical tick-0 Round snapshot. The
transaction prepares the complete change in scratch state and restores every
live module if commit fails. Local replay UI, results, rewards, persistence,
bots, and transport remain adapters outside this module. The seed intentionally
preserves the Round's established reset-time transient state rather than
constructing a fresh Round.

## Skyway Round Checkpoint Bundle

The pure opt-in checkpoint format that captures one aligned Skyway Round,
including its owned Input Timeline, plus Snapshot History, Command Journal, and
Replay Event Ledger state under one caller-supplied session incarnation and
round epoch. The bundle is detached, immutable, JSON-safe, and carries stable
non-cryptographic hashes for its exact Round snapshot and complete payload.
Restore validates every retained ring entry in scratch state before atomically
updating the live modules while preserving their top-level identities. A
checkpoint cannot cross a session incarnation or round epoch, and it cannot
restore behind event ticks whose presentation effects were already committed.
The session incarnation is a trusted caller assertion, not identity,
authentication, persistence, or network authority. Rendering, bots, results,
rewards, persistence, transport, and Public Network remain adapters outside
this module.

## Skyway Authoritative Correction

The pure opt-in transaction that accepts one caller-asserted authoritative
participant input against the exact current Round Checkpoint Bundle. It works
only in scratch state while it upgrades Command Journal provenance, rolls back
and deterministically resimulates changed input, rebuilds Snapshot History,
replaces the Replay Event Ledger window, and creates a current Round Finality
token. The corrected Checkpoint Bundle is committed to the live modules only
after every step succeeds, so the supplied checkpoint remains the atomic abort
image and the returned checkpoint becomes the next optimistic precondition.
Resimulated events stay presentation-suppressed and uncommitted. The
environment factory is a deterministic Adapter bound to the scratch Round and
course; its purity is contractual rather than enforceable. Authority,
finality, session incarnation, and environment integrity remain trusted caller
assertions, not authenticated server proof. Transport, UI, results, rewards,
persistence, deployment, and Public Network remain outside this module.

## Skyway Authoritative Correction Batch

The bounded, pure opt-in batch Interface in the Authoritative Correction Module
accepts 1–32 caller-asserted participant inputs against one exact Round
Checkpoint Bundle. Inputs are normalized, equivalent repeated
`(tick, participant)` keys are deduplicated, conflicting values for one key are
rejected, and the retained set is processed in canonical tick/participant
order. All Journal replacements happen in scratch state before one rollback
from the earliest simulation-changing tick, one deterministic resimulation,
one History rebuild, one Ledger range replacement, one Finality token, and one
corrected Checkpoint Bundle. Provenance-only upgrades do not widen the rollback;
an all-duplicate batch is an immutable no-op. The existing single-correction
Interface delegates to this shared Implementation while preserving its v1
result shape.

The capacity bounds command validation and ordering work, not retained-state
memory or rollback duration. Intra-batch conflicts deliberately have no
last-write-wins policy. Returned resimulation events remain suppressed and
uncommitted. Authority labels, session incarnation, deterministic environment,
and finality remain trusted caller assertions; this Seam is not authenticated
server authority. Transport, UI, results, rewards, persistence, deployment,
and Public Network remain outside this Module.

## Skyway Input Admission Window

The pure opt-in, fixed-capacity Module ahead of Authoritative Correction. Its
Interface binds a caller-supplied session incarnation and round epoch to an
ordered participant roster and immutable participant-to-owner assignments for
that round. Each owner has one contiguous client sequence and admission
acknowledgement. Exact retries are idempotent, older sequences are replays,
gaps are rejected, and a changed payload at an acknowledged sequence is a
conflict. A later sequence may repeat the same normalized input for the same
tick and participant without queueing another correction, but conflicting
input never uses last-write-wins.

The Window accepts only ticks inside its bounded past/future horizon. Future
input remains buffered until the authoritative head reaches it. Ready
decisions are emitted non-destructively in canonical tick then participant
order, capped to the Authoritative Correction Batch capacity. The immutable
batch carries a stable non-cryptographic correlation hash; committing that
exact current batch marks its decisions emitted, while an aborted downstream
transaction leaves the same batch retryable. Head advancement may evict only
emitted history and fails rather than silently expiring pending input.
Snapshots, atomic restore, and epoch reset are provided, but this state has not
yet joined the Round Lifecycle or Checkpoint Bundle transaction.

An acknowledgement means only that a sequence was admitted to this Window. It
does not mean simulation correction, event finality, results, or rewards were
committed. Owner IDs, assignments, session incarnation, tick choice, and
sequences remain trusted caller assertions, not authenticated transport facts.
The current RoomProtocol does not carry the required epoch, incarnation,
participant, or target tick, and is intentionally unchanged. Transport,
server, UI, results, rewards, persistence, deployment, and Public Network
remain Adapters outside this Seam.

## Skyway Authoritative Intake

The pure opt-in transaction Module that closes the in-process Seam between one
exact Input Admission reservation and one Authoritative Correction Batch. Its
Interface requires the current Round Checkpoint Bundle, Admission batch, and
their shared session incarnation, round epoch, participant order, and
authoritative head tick. The Implementation validates and commits Admission
only in scratch state, corrects the scratch Round stack, preflights both final
restores, then rechecks the live checkpoint hash and complete Admission
snapshot/revision before changing either target.

After both optimistic preconditions pass, the transaction restores one
corrected Round checkpoint and one committed Admission snapshot while
preserving every live top-level Module identity. If the second restore were to
fail after the first, both abort images are restored. Correction failure leaves
the exact Admission reservation pending and retryable; an all-duplicate
correction still commits its reservation. An exact empty reservation is an
immutable no-op. The result returns the corrected checkpoint, committed
Admission snapshot and acknowledgement set, nested correction/finality
evidence, and both before/after correlation hashes.

This atomicity is synchronous and process-local. Admission is intentionally not
added to the Round Checkpoint Bundle format or Round Lifecycle transaction in
this slice. Input ownership, session incarnation, environment purity, and
sequence provenance remain trusted caller assertions. Transport, RoomProtocol,
server routing, UI, results, rewards, persistence, deployment, and Public
Network remain unwired Adapters outside this Module.

## Skyway Authoritative Lifecycle

The pure opt-in transaction Module that rotates the existing Round Lifecycle
and Input Admission Window through the same epoch reset. Its Interface requires
the exact current Round Checkpoint Bundle and Admission snapshot as independent
optimistic preconditions under one session incarnation and round epoch. The
Admission head tick and participant order must match the Round checkpoint.

Both existing reset Implementations run first on scratch copies and again on
throwaway preflight copies. The transaction requires identical epoch `N+1`,
tick-zero, seeded History, cleared Journal/Ledger, cleared Admission decisions,
reset acknowledgements, and stable result hashes. Immediately before commit it
rechecks the live checkpoint and complete Admission snapshot/revision. Commit
resets Admission first, then delegates the four-object Round reset to the
existing atomic Round Lifecycle Module; a Round reset failure restores the
bounded Admission abort image. All live top-level identities and the Round's
existing nested identity guarantees are preserved.

The result returns the new epoch checkpoint and Admission snapshot, both reset
envelopes, cleared decision/acknowledgement counts, and before/after correlation
hashes. Old-epoch acknowledged inputs are explicitly cancelled by lifecycle
rotation; they are not claimed as corrected or finalized. Existing Round
Checkpoint, Admission, and Round Lifecycle formats remain unchanged.
Atomicity is synchronous and process-local, and hashes are non-cryptographic.
Transport, reconnect handshakes, RoomProtocol, server routing, UI, results,
rewards, persistence, deployment, and Public Network remain unwired Adapters.

## Skyway Authority Checkpoint

The pure opt-in Authority Checkpoint Module wraps one unchanged Round
Checkpoint Bundle and one unchanged Input Admission snapshot. Its v1 Interface
binds the two component hashes to one session incarnation, round epoch, aligned
head tick, ordered participant roster, ownership-aware roster hash, and
canonical authority checkpoint hash. Creation uses only the existing public
snapshot APIs, deeply freezes the aggregate, and remains JSON round-trippable.

Same-epoch restore requires the caller's exact expected live authority hash as
an optimistic overwrite precondition. Both existing restore Implementations
run first on scratch copies, and the recreated scratch aggregate must match the
source hash and canonical image exactly. A second live authority-hash check
runs immediately before commit. Admission restores first; the existing atomic
Round Checkpoint restore then owns Round, History, Journal, and Ledger
mutation. If that restore unexpectedly fails, the bounded Admission abort
image is restored through its public same-epoch restore Interface.

This Seam preserves the live Round, History, Journal, Ledger, and Admission
top-level identities; the Round restore retains its existing nested identity
guarantees. It rejects cross-session/cross-epoch work, head/roster divergence,
component or aggregate tampering, incompatible capacities/configuration, stale
target CAS, and restoration behind committed presentation effects before
partial live work.

Atomicity and CAS are synchronous and process-local. Stable hashes are
deterministic integrity/correlation values, not authentication. Restore accepts
an optional Admission ACK Watermark and rejects either a current target or
requested image below that per-owner committed floor. Omitting the watermark
preserves the original opt-in behavior and can rewind Admission acknowledgement
and revision state. Clone cost scales with the full retained Round stack plus
Admission window. Transport, RoomProtocol, server routing, UI, results,
rewards, persistence, deployment, and Public Network remain unwired.

## Skyway Admission ACK Finality

The pure opt-in Admission ACK Finality Module represents a caller-asserted
externally committed acknowledgement frontier for one Authority Checkpoint.
Its immutable v1 Watermark binds session incarnation, round epoch, ordered
roster and ownership hash, exact Authority Checkpoint and Admission snapshot
hashes, Admission revision and tick, and every owner acknowledgement. A
non-negative acknowledgement also binds the canonical hash of that owner's
exact last accepted command.

Creating a Watermark marks the current complete owner acknowledgement vector as
the committed floor. Advancing it requires the same session, epoch, roster,
owner count, and owner order. Every owner sequence must stay equal or increase;
an equal sequence must retain the same command hash, preventing same-sequence
ABA forks. Repeating the same frontier is idempotent. Tick and Admission
revision remain audit coordinates rather than monotonic constraints because
the acknowledgement vector is the irreversible state.

Authority Checkpoint restore can consume the Watermark as an optional guard.
Before scratch preparation, both the current abort checkpoint and requested
source checkpoint must satisfy its owner floors and command hashes. This guard
does not replace the required target authority-hash CAS. Any rewind, fork,
stale lifecycle, or ownership mismatch fails before live mutation. The
Watermark remains separate from the existing Round Checkpoint, Admission
snapshot, and Authority Checkpoint formats.

Watermarks are epoch-scoped. Authoritative Lifecycle reset intentionally
invalidates the previous epoch's Watermark and a fresh tick-zero Watermark
starts with acknowledgement `-1` for each owner. Finality is still a trusted
caller assertion: it becomes externally meaningful only if a future authority
Adapter durably commits the Watermark before or atomically with ACK delivery.
Stable hashes are non-cryptographic and do not prove identity, causality, or
delivery. Persistence, reconnect protocol, authentication, transport, server
routing, UI, deployment, and Public Network remain unwired.

## Skyway Owner Resync Planner

The pure opt-in Owner Resync Planner Module turns one structurally validated
owner resume claim, one caller-authenticated owner ID, the current Authority
Checkpoint, and current Admission ACK Watermark into one deterministic,
immutable directive. The claim is exact-keyed, canonically hashed, and bounded
to 512 UTF-8 bytes. It carries only a hashed session incarnation, round epoch,
owner ID, exact Authority and Watermark hashes, and that owner's committed ACK
sequence and last-command hash.

Resume is deliberately conservative: the claim's lifecycle, Authority hash,
Watermark hash, owner ACK, and last-command hash must exactly match current
state, and the current Admission owner state must equal the externally
committed Watermark frontier. The resulting directive supplies
`nextClientSequence`, authoritative tick and checkpoint hash, while omitting
the full checkpoint. Any lifecycle, Authority, Watermark, or ACK divergence
returns a `full-resync` directive instead of claiming that a missing delta
history exists. Sequence exhaustion also requires full resync and ultimately an
epoch rotation.

The authenticated owner ID is a separate trusted caller input; the claim's
owner ID is never treated as authentication. An owner mismatch or missing
owner fails with one generic authorization error. A successful directive
contains only that owner's ordered participant IDs, current ACK and command
hash, hashed session incarnation, and aggregate correlation hashes. It never
contains the raw session incarnation, other owners or ACKs, Admission slots,
commands, Round state, or a snapshot. Directives are bounded to 2 KiB and
canonically hashed.

This Module plans a future Adapter action only. `full-resync` does not build,
filter, persist, or send an Authority snapshot, and `resume` does not create a
lease or reserve a sequence. The exact-Authority policy may intentionally
produce frequent full resyncs until a bounded delta/history Interface exists.
Claim and directive hashes are non-cryptographic; authentication, MAC/signing,
rate limits, delivery guarantees, durable watermark commit, transport,
RoomProtocol, server routing, UI, deployment, and Public Network remain
unwired.

## Skyway Owner Full Resync Snapshot

The pure opt-in Owner Full Resync Snapshot Module projects one current
Authority Checkpoint and Admission ACK Watermark through one exact
`full-resync` Owner Resync Planner directive. Its Interface separately requires
the caller-authenticated owner ID, validates the directive hash and current
Authority/Watermark binding, and rejects resume directives, stale heads, stale
watermarks, or owner mismatch before producing an image.

The public Round projection contains only the fixed-tick countdown, course
clock/hazard state, and every participant's public race and locomotion state.
It deliberately allowlists those fields rather than copying the Round snapshot
wholesale. The Input Timeline is omitted, as are Snapshot History, Command
Journal, Replay Event Ledger, checkpoint restore state, and any future
unreviewed Round fields. Other participants remain visible because their
positions and race state are public Round state; their ownership and authority
metadata do not.

Admission projection contains the shared tick, revision, and horizon
coordinates plus only the authenticated owner's ordered participant IDs. It
keeps that owner's current admitted ACK/hash and externally committed
Watermark ACK/hash as distinct fields, so an Admission frontier ahead of the
durable Watermark is not mislabeled as committed. No raw accepted command,
Admission slot/decision, other owner ID, ownership assignment, or other-owner
ACK is emitted.

The public Round image is capped at 24 KiB and the complete immutable,
JSON-safe snapshot at 32 KiB. Both the public Round and complete snapshot carry
canonical non-cryptographic hashes, and the envelope binds the Planner
directive, Authority Checkpoint, Watermark, epoch, hashed session incarnation,
tick, and roster. Projection is read-only and creates neither a reconnect
lease nor a restorable authoritative checkpoint. The format is not registered
with RoomProtocol and no transport, server routing, UI, persistence,
deployment, or Public Network Adapter consumes it.

## Skyway Reconnect Lease

The pure opt-in Reconnect Lease Module is a fixed-capacity, epoch-scoped
reservation window between one Owner Full Resync Snapshot and a future resumed
Input Admission Adapter. Its Interface binds each immutable lease token to the
caller-authenticated owner, exact Planner directive and resync snapshot hashes,
exact Authority Checkpoint and Watermark hashes, hashed session incarnation,
round epoch, ownership-aware roster, issue tick, exclusive expiry tick, next
client sequence, and reservation revision.

Reservation reprojects the supplied resync image through the current Authority
Checkpoint and Watermark before mutation. It requires an exact window revision
CAS, keeps at most one unexpired active lease per owner, and makes an exact
same-head retry idempotent. The window holds 1–8 slots, tokens are capped at
1 KiB, the complete window image at 12 KiB, and lease duration at 1–120
authoritative fixed ticks. Capacity failure is explicit. Expired slots are
reclaimed deterministically by slot order; wall time is never read.

Consumption requires a second exact revision CAS, caller-owner match, current
session/epoch/roster, current Authority and Watermark hashes, the original
issue head, and a tick strictly before expiry. One successful consumption
returns the reserved next client sequence and changes the slot to a consumed
tombstone. The tombstone remains until expiry so a same-lease replay is
rejected as already consumed rather than becoming an ambiguous missing token.
Cross-epoch, stale-head, expired, duplicate, tampered, and unknown leases fail
before mutation.

The CAS and single-use guarantee are synchronous and process-local to this
Module. Consumption does not itself admit input and therefore is not yet atomic
with Input Admission; the Authority head or Admission revision may change
immediately afterward. Lease hashes are non-cryptographic, the authenticated
owner remains a trusted caller assertion, and the window has no lifecycle
reset outside the opt-in Reconnect Authority Checkpoint transaction,
persistence, replication, crash recovery, or durable delivery semantics.
RoomProtocol, transport, server routing, UI, results, rewards, deployment, and
Public Network remain unwired.

## Skyway Authoritative Reconnect Intake

The pure opt-in Authoritative Reconnect Intake Module composes one exact
Reconnect Lease consumption with the first resumed Input Admission command. Its
Interface requires the caller-authenticated owner, lease token, command,
current Authority Checkpoint and Watermark, and complete base snapshots of the
lease window and Admission window as independent optimistic preconditions.
The command owner and client sequence must exactly match the lease, while the
existing Admission Interface remains authoritative for participant ownership,
tick horizon, input normalization, sequence conflict, and capacity policy.

The Implementation first compares both complete live images to their supplied
base images, then consumes the lease and admits the command only on scratch
copies. Any rejected command leaves the live lease active and Admission
unchanged. It proves the prepared Admission image through the existing restore
Seam, rechecks both complete live targets immediately before commit, and
constructs the immutable result before mutation.

Commit restores the prepared Admission image first and then consumes the live
lease through its existing single-use CAS. If that final lease consumption
unexpectedly rejects, Admission is restored to its exact abort image. Success
advances both revisions once and returns one canonically hashed envelope with
the lease, directive, resync snapshot, Authority, Watermark, participant, tick,
and before/after lease-window and Admission snapshot hashes. Existing lease,
Admission command, and Admission snapshot formats are unchanged.

Atomicity is synchronous and process-local. The transaction admits one command
but does not reserve, correct, simulate, finalize, persist, or acknowledge that
command downstream. Neither target is durable or replicated, and process
failure between in-memory assignments is outside the guarantee. Caller
authentication, session identity, Authority, Watermark finality, and hashes
remain trusted/non-cryptographic foundation inputs. RoomProtocol, transport,
server routing, UI, results, rewards, deployment, and Public Network remain
unwired.

## Skyway Authoritative Reconnect Correction

The pure opt-in Authoritative Reconnect Correction Module extends one
Authoritative Reconnect Intake through the existing Input Admission batch and
Authoritative Intake/Correction stack. Its Interface adds the live Round,
Snapshot History, Command Journal, Replay Event Ledger, deterministic
environment Adapter, and exact current Authority Checkpoint to the reconnect
lease, first command, Watermark, and dual base snapshots.

All work is first prepared on cloned Lease, Admission, Round, History, Journal,
and Ledger state. Reconnect Intake consumes the scratch lease and admits the
command. The Module then creates the complete canonical ready Admission batch
through the current Authority tick and requires it to contain exactly that one
owner/participant/sequence/tick decision. Future commands and competing ready
work fail instead of silently widening or reordering the reconnect
transaction.

The existing Authoritative Intake Implementation commits the scratch Admission
batch, applies Authoritative Correction, rolls back and resimulates when
needed, rebuilds History, replaces the uncommitted Ledger window, and returns a
Round Finality token with presentation still suppressed. The resulting Round
stack and Admission image are wrapped in a new Authority Checkpoint. The prior
Admission ACK Watermark is validated only as a floor; it is neither advanced
nor presented as delivery finality.

Before live mutation, the Module proves the corrected Authority through the
existing restore Seam and rechecks the complete live Authority and lease-window
images. Commit restores the corrected five-target Authority first, then
consumes the live lease. If lease consumption unexpectedly rejects, the
Authority is restored to its exact abort checkpoint. Success therefore changes
Lease plus the Authority-wrapped Admission/Round side in one synchronous
three-target transaction and returns the new Authority Checkpoint, nested
Reconnect and Authoritative Intake evidence, canonical batch, before/after
hashes, and an explicit `requiresAckWatermarkAdvance` marker.

Atomicity remains process-local and assumes the existing synchronous restore
and consume Implementations do not fail after their final mutation point.
Correction events remain staged/uncommitted, and ACK Watermark advancement,
durable ACK delivery, persistence, replication, crash recovery, authentication,
transport, RoomProtocol, server routing, UI, results, rewards, deployment, and
Public Network remain explicit unwired Adapters.

## Skyway Reconnect Authority Checkpoint

The pure opt-in Reconnect Authority Checkpoint Module wraps one unchanged
Authority Checkpoint, one complete Reconnect Lease window snapshot, and one
unchanged Admission ACK Watermark. Its v1 Interface binds the three images to
one session incarnation hash, round epoch, aligned authoritative tick,
ownership-aware roster, component hashes, and canonical reconnect-authority
checkpoint hash. The Watermark may intentionally lag the Authority as long as
the Authority remains at or above every committed owner floor.

Same-epoch restore requires one exact live aggregate hash as an optimistic
precondition and the exact embedded Watermark as a caller input. Authority and
Lease restores run first on scratch copies, the complete aggregate is
recreated canonically, and the live aggregate is checked again before
mutation. Lease restores first and the existing atomic Authority restore then
owns Admission, Round, History, Journal, and Ledger mutation; an unexpected
Authority rejection restores the Lease abort image. All live top-level
identities and existing Round nested identities are preserved. The Interface
cannot change, advance, rewind, or publish ACK finality.

The wrapper-level lifecycle transaction composes the existing Authoritative
Lifecycle reset with a Lease-window reset. It clears both active leases and
consumed tombstones, preserves Lease capacity and tick duration, rotates every
stateful Module from epoch N to N+1, and returns a fresh tick-zero Authority,
empty Lease window, and new all-`-1` epoch Watermark. The old Watermark is not
advanced or carried forward; the returned Watermark is an unpublished
initialization image that a future Adapter must explicitly adopt and durably
publish. Existing Authority, Round Checkpoint, Admission, Lease, and Watermark
formats remain unchanged.

Atomicity and CAS remain synchronous and process-local. Full preparation
clones and canonically hashes the retained Authority stack plus the bounded
Lease window. There is no crash recovery, durable log, replication,
cross-process exclusion, authentication, signed integrity, durable ACK
delivery, or latency budget. Lifecycle reset deliberately invalidates all
outstanding leases. Transport, RoomProtocol, server routing, UI, results,
rewards, persistence, deployment, and Public Network remain unwired Adapters.

## Skyway Reconnect ACK Commit

The pure explicit Reconnect ACK Commit Module consumes one exact Authoritative
Reconnect Correction result and its exact current Reconnect Authority
Checkpoint. Its Interface validates the complete correction result and
transaction hash, proves the corrected Authority image, consumed Lease token
and tombstone, canonical Admission batch, prior Watermark, and aggregate
checkpoint hashes, then invokes only the existing monotonic Admission ACK
Watermark advance Interface.

Because that Watermark Interface advances the complete owner vector, the
transaction fails unless exactly the reconnecting owner's frontier moves by
the one lease-reserved client sequence. It therefore cannot silently finalize
an unrelated owner's future-buffered Admission command. Success returns a new
Reconnect Authority Checkpoint whose Authority and Lease hashes are unchanged
and whose only advanced component is the Watermark. The source correction,
checkpoint, Watermark, Lease image, and Round sidecars are never mutated.

The transaction also returns a separate immutable owner-only ACK delivery
intent capped at 2 KiB. The intent binds the correction, Lease, Authority,
previous/new checkpoint, and previous/new Watermark hashes plus the one owner,
participant, sequence, and last-command hash. It excludes the raw session
incarnation, input command, other-owner acknowledgements, full checkpoint,
Lease token, Replay Event Ledger events, results, and rewards. It is explicitly
marked not delivered and not durably adopted.

Calling this pure Module creates only candidate finality evidence. An exact
retry against the same old checkpoint is deterministic, while the same
correction is stale against the returned post-advance checkpoint. A future
Adapter must durably CAS-adopt the new checkpoint/Watermark before or
atomically with sending the delivery intent; neither action exists here.
Hashes remain non-cryptographic and caller authority remains trusted. Replay
Event Ledger commit, presentation release, persistence, crash recovery,
replication, authentication, protocol, transport, server routing, UI,
deployment, and Public Network remain unwired.

## Skyway Reconnect ACK Outbox

The pure opt-in Reconnect ACK Outbox/Adoption Journal is the first in-memory
Adapter around one Reconnect ACK Commit result. Its record Interface validates
the complete ACK Commit envelope, exact current pre-transition Reconnect
Authority Checkpoint, journal revision, and adopted checkpoint head before it
stores the exact bounded delivery intent. Success advances the journal head
from that pre-checkpoint to the ACK Commit post-checkpoint and records one
canonically hashed adoption entry. The entry continues to say that durable
adoption, ACK delivery, receipt, Replay Event Ledger commit, and presentation
have not happened.

The journal has a fixed maximum of eight slots, a 4 KiB entry bound, 1 KiB
claim bound, and 48 KiB complete-image bound. Exact adoption retries are
deterministic while their evidence remains retained. Empty slots are used
first; only the oldest consumed tombstone may eventually be reclaimed.
Pending or claimed delivery work is never evicted, so a full journal fails
closed. Reclaiming a consumed tombstone deliberately ends the older
transaction's retained idempotence evidence.

Delivery claims are selected by the lowest adoption revision and only one
claim may be in flight across the journal. Retrying that retained claim returns
the same claim and intent without a revision change. Consuming the exact claim
is single-use and idempotently retryable while its tombstone remains retained,
but consumption means only release from this process-local outbox. Both claim
and consume results explicitly remain not delivered and not receipt-recorded.

Epoch reset requires an exact base journal image and exact adopted old
Reconnect Authority Checkpoint, plus a same-session, same-roster, consecutive
tick-zero checkpoint with an empty Lease window and fresh all-`-1` Watermark.
It clears pending, claimed, and consumed entries and invalidates old claims.
Reset explicitly does not finalize unresolved old-epoch intents.

All mutation and CAS guarantees are synchronous and process-local. The outbox
is neither durable nor replicated; snapshots are validation images, not
storage. A crash can lose pending, claimed, or consumed evidence, and there is
no cross-process exclusion, send, receipt, retry scheduler, durable checkpoint
adoption, or crash recovery. A higher transaction must still compose future
Authority-head changes between ACK commits. Hashes remain non-cryptographic
and caller authentication remains trusted. Replay Event Ledger presentation,
protocol, transport, server routing, UI, results, rewards, persistence,
deployment, and Public Network remain unwired.

## Skyway Reconnect Finality Checkpoint

The pure opt-in Reconnect Finality Checkpoint Module binds one unchanged
Reconnect Authority Checkpoint and one exact Reconnect ACK Outbox snapshot
under a single canonical aggregate head. Its v1 Interface carries the session
incarnation and hash, round epoch, authoritative tick, participant order,
ownership-aware roster, Authority head, Outbox revision/capacity and component
hashes. Creation fails unless the Outbox adopted Authority and Watermark heads
exactly equal the wrapped Reconnect Authority Checkpoint.

The ACK adoption transaction closes the previous two-call ordering Seam. It
requires one exact current aggregate checkpoint, prepares the existing Outbox
adoption on a scratch journal, binds that prepared journal to the ACK Commit
post-checkpoint, rechecks the complete live Outbox image, and only then records
the live adoption. It returns the next aggregate checkpoint plus the exact
adoption evidence. Exact retained retries are immutable no-ops. Durable
adoption, ACK delivery, receipt, Replay Event Ledger commit, and presentation
remain explicitly false.

Same-epoch restore requires the current Reconnect Authority Checkpoint and the
exact aggregate target hash. It proves the current mutable Authority/Lease
stack and Outbox against that head, restores both complete images on scratch
copies, and recreates the requested aggregate canonically. Commit restores the
Outbox first and delegates the Authority/Lease/Round side to the existing
atomic Reconnect Authority restore; an unexpected deeper rejection restores
the exact Outbox abort image. The live Outbox, Lease, Admission, Round,
Snapshot History, Command Journal, and Replay Event Ledger top-level
identities, plus existing Round nested identities, are preserved.

The lifecycle transaction similarly proves one exact aggregate, prepares the
existing Reconnect Authority lifecycle and Outbox epoch reset together, and
returns one epoch `N+1`, tick-zero aggregate. It clears active/consumed Leases
and pending/claimed/consumed Outbox evidence, creates the fresh all-`-1`
Watermark, and never labels discarded old-epoch work as finalized, delivered,
or receipt-recorded. If the deeper Authority reset rejects after the prepared
Outbox reset, the Outbox is restored to its exact old-epoch abort image.

The aggregate is capped at 512 KiB. This is an opt-in compatibility guard for
this Module, not a new bound on the underlying Authority Modules, whose
configured retained-ring capacities still have no universal maximum. Full
creation and restore clone and canonically hash that complete image, with no
separate latency or allocation budget yet.

Atomicity and CAS remain synchronous and process-local, with no crash
atomicity, durable log, replication, or cross-process exclusion. Same-epoch
restore may rewind in-memory claim/consume evidence because neither means
external delivery; a future send Adapter must introduce a durable delivery
floor before such restoration can be allowed after sending. FNV hashes remain
non-cryptographic and caller authentication remains trusted. The older
Authority and Outbox Interfaces remain callable independently, so the
non-independent guarantee applies to Adapters that adopt this deeper Module.
Storage, send, receipt, retry scheduling, protocol, transport, server routing,
UI, results, rewards, Replay Event Ledger presentation, deployment, and Public
Network remain unwired.

## Skyway Reconnect Lease Reservation Finality

The pure opt-in Reconnect Lease Finality Reservation Module closes the
pre-correction Lease-head ordering Seam required by the sequential ACK bridge.
Its Interface accepts one exact Reconnect Finality checkpoint, one exact
immutable ACK Delivery Finality Watermark, an authenticated owner plus
validated full-resync directive/projection, and exactly two mutable targets:
the Lease window and ACK Outbox. The underlying Authority checkpoint and
Admission ACK Watermark are derived only from the base Finality image rather
than accepted as caller-selectable duplicates.

The Implementation validates both aggregate CAS heads and complete live target
images, then runs the existing Lease reservation on scratch state. A fresh
reservation advances the Lease revision once. It creates a Reconnect Authority
checkpoint around the unchanged Authority and Admission Watermark plus that
reserved Lease image, privately promotes only the Outbox's adopted Authority
head while advancing the Outbox revision once, and creates one aligned
Reconnect Finality checkpoint. Every Outbox slot, adoption, claim, status,
consume revision, capacity, lifecycle, roster, and Admission-Watermark byte is
preserved. The revision advance lets the unchanged Delivery Finality Watermark
accept the new checkpoint as a monotonic image rather than reject an
equal-revision fork.

An exact still-active reservation retry is a retained no-op: Lease, Outbox, and
Finality revisions and hashes do not churn. Fresh work is prepared completely
on scratch copies, both live images are rechecked immediately before commit,
and the same operations are repeated live. Any unexpected rejection or
640 KiB result-bound failure restores the exact Outbox abort image first and
the exact Lease abort image second while preserving both top-level object
identities. The immutable result explicitly reports that correction,
delivery/receipt finality, storage, send, receipt acquisition, and
presentation did not occur.

This Module accepts the owner-safe full-resync projection already required by
the Lease Interface; it does not introduce a reservation path for a bounded
resume directive. Its CAS and rollback guarantees are synchronous and
process-local, so a process crash between mutations is not repaired and there
is no cross-process exclusion. The planner claim, authenticated owner, and
delivery/receipt assertions remain caller-trusted, and FNV hashes remain
non-cryptographic. Direct Lease reservation, Outbox restore/head edits, older
Reconnect Authority/Finality creators, and legacy ACK adoption Interfaces
remain callable bypasses. A future production Adapter must exclusively
orchestrate this deeper reservation Interface and the sequential correction /
ACK path—or place them behind a durable transaction boundary—to inherit the
ordering guarantee. Durable storage, crash recovery, replication,
authentication, signing, rate limits, send, receipt acquisition, retry
scheduling, protocol, transport, server routing, UI, results, rewards, Replay
Event Ledger presentation, deployment, and Public Network remain unwired.

## Skyway Reconnect ACK Delivery Finality

The pure opt-in Reconnect ACK Delivery Finality Module is an immutable
externally asserted floor kept outside the restorable Reconnect Finality
Checkpoint. Its v1 Watermark binds one ordered owner vector to the session
incarnation hash, round epoch, ownership-aware roster, and latest Reconnect
Finality, Reconnect Authority, and Outbox heads. Creating a Watermark always
starts every owner's delivered and receipt stages at `null`; existing pending,
claimed, or consumed Outbox work is never inferred to have been sent.

Delivery and receipt are separate monotonic caller assertions. Either advance
requires the exact authenticated owner input, bounded delivery intent, claim,
and a consumed Outbox tombstone in the supplied Reconnect Finality checkpoint.
The retained stage binds owner, participant, ACK sequence, accepted-command
hash, adoption, intent, claim, canonically derived consume evidence, consumed
revision, Outbox image, and aggregate Finality head. Lower sequences reject,
an equal sequence with the same core evidence is an immutable retry, and an
equal sequence with different evidence is an ABA fork. Receipt can advance
only to that owner's exact current delivered frontier; it may catch up after
later deliveries without requiring a retained per-sequence receipt history.

The restore guard validates both lifecycle/owner order and the candidate
aggregate against the Watermark head. The candidate Outbox revision cannot
move backward; an equal revision must retain the exact Outbox and Finality
hashes. Every delivered owner must remain at or above its committed Admission
ACK sequence and preserve the accepted-command hash at equality. If the
referenced Outbox tombstone is still retained, its complete consumed evidence
must match; absence is allowed only at a strictly newer Outbox revision after
deterministic reclamation. Reconnect Finality restore accepts this Watermark as
an optional guard and checks both the current abort image and requested source
before scratch mutation. Older direct restore Interfaces remain unguarded.

Lifecycle reset first requires the old aggregate to satisfy the Watermark,
then accepts only the same session and roster at epoch `N+1`, tick zero, with
an empty revision-zero Outbox and fresh all-`-1` Admission ACK Watermark. It
returns a new all-null Delivery Finality Watermark and explicit reset evidence;
prior delivery and receipt facts are not carried into or relabeled in the new
epoch.

The complete Watermark is capped at 16 KiB for at most eight ordered owners.
Hashes are canonical FNV correlation evidence, not authentication,
cryptographic integrity, proof of send, or proof of receipt. Delivery and
receipt advances are trusted caller assertions for future Adapters; this
Module performs neither action. There is no durable write, crash recovery,
replication, cross-process CAS, signing, receipt history, or tombstone-retention
coordination. Legacy Outbox calls can reclaim evidence before it is finalized,
and the restore floor is effective only when every Adapter supplies it.
Storage, send, receipt acquisition, retry scheduling, protocol, transport,
server routing, UI, results, rewards, Replay Event Ledger presentation,
deployment, and Public Network remain unwired.

## Skyway Reconnect ACK Receipt-Finalized Reclamation

The pure opt-in Reconnect ACK Reclamation Adoption Module deepens ACK adoption
behind one delivery-aware Interface. It requires the exact current Reconnect
Finality checkpoint hash and immutable Delivery Finality Watermark hash,
validates the complete live Outbox image against that checkpoint, and prepares
the existing ACK adoption on a scratch Outbox before committing the live
Outbox. The Delivery Finality Watermark is an immutable CAS floor and is
returned unchanged; this Module does not assert a new delivery or receipt.

An exact retained ACK-adoption retry remains a no-op. A new adoption uses an
empty Outbox slot first. When the Outbox is full, the Module considers only the
same oldest consumed tombstone selected by the existing Outbox implementation.
It never skips that entry for a newer consumed tombstone. Reclamation is
permitted only when the Delivery Finality Watermark retains a receipt stage
matching the tombstone's exact owner, participant, ACK sequence, accepted
command, adoption, delivery-intent, claim, canonical consume, and consumed
revision evidence. Delivery finality without receipt finality is insufficient.
Pending and claimed work remains non-evictable and a full unresolved Outbox
fails closed.

Reclamation and recording the replacement adoption occur in the same Outbox
revision change; no observable empty-slot state is produced. The Module
rechecks the complete live Outbox after scratch preparation, compares the live
result with the prepared result, and restores the exact abort Outbox image if
an unexpected post-mutation rejection or result-bound failure occurs. Its
result is immutable, canonically hashed, capped at 768 KiB, and explicitly
states that the Delivery/Receipt Watermark did not advance and no storage,
send, or receipt acquisition happened.

The Module assumes its supplied Reconnect Finality checkpoint already wraps
the Reconnect Authority head named as the ACK Commit's previous head. It does
not promote an intervening correction/Authority head. CAS and rollback remain
synchronous and process-local, not crash-atomic or cross-process. The older
Outbox and Reconnect Finality adoption Interfaces remain callable and can
bypass receipt-aware reclamation, so future Adapters must adopt this deeper
Module to obtain the guarantee. Delivery receipts remain trusted caller
assertions and FNV hashes remain non-cryptographic. Because the Delivery
Finality Watermark retains only the latest receipt per owner, advancing past an
older unreclaimed tombstone removes its exact reclamation evidence and safely
causes backpressure rather than eviction. Durable receipt history, durable
adoption, authentication, storage, replication, send, receipt acquisition,
retry scheduling, protocol, transport, server routing, UI, results, rewards,
Replay Event Ledger presentation, deployment, and Public Network remain
unwired.

## Skyway Sequential Reconnect ACK Authority Bridge

The pure opt-in Sequential Reconnect ACK Adoption Module closes the
post-correction Authority-head ordering Seam for repeated ACK adoption. Its
Interface accepts one exact current Reconnect Finality checkpoint and Delivery
Finality Watermark, the already-produced Authoritative Reconnect Correction,
the post-correction/pre-ACK Reconnect Authority checkpoint, the ACK Commit,
and the live Outbox. Exact caller-supplied Finality and Delivery Watermark
hashes are optimistic preconditions.

The Module proves the correction's previous Authority, Admission, Lease, and
unchanged Admission ACK Watermark hashes against the prior Finality
checkpoint. It proves the supplied post-correction Reconnect Authority head
against the correction's corrected Authority and consumed Lease hashes, then
canonically recomputes the ACK Commit from that correction and head. A
well-formed but validly rehashed non-canonical delivery intent is therefore
rejected rather than adopted.

Head promotion remains private to this Implementation. It preserves every
Outbox slot, adoption, claim, status, consumed revision, capacity, lifecycle,
and Watermark byte while changing only the adopted Reconnect Authority head
and advancing the Outbox revision once. The revision advance is required so
the Delivery Finality guard sees a monotonic newer image rather than an
equal-revision fork. The promoted Outbox and post-correction Authority form an
intermediate Reconnect Finality checkpoint. The Module then delegates to the
existing receipt-aware adoption Interface, which advances the Outbox once
more and retains its exact empty-slot, full-backpressure, and
oldest-receipt-finalized reclamation policy. A normal new sequential adoption
therefore advances the Outbox from revision `N` to bridge revision `N+1` and
final adoption revision `N+2`.

All work runs first on a scratch Outbox. The complete live Outbox is rechecked
against the prior Finality image immediately before commit, the bridge and ACK
adoption are repeated live, and their complete results must match scratch
canonically. An unexpected post-mutation rejection or 800 KiB result-bound
failure restores the exact abort Outbox image. The Delivery Finality Watermark
is returned unchanged, and the result explicitly states that correction was
not applied by this transaction and that no storage, send, receipt
acquisition, presentation, or finality advance occurred.

This Module's mutable target and rollback guarantee cover only the Outbox.
The correction, pre/post Reconnect Authority checkpoints, ACK Commit, and
Watermarks are immutable evidence already produced elsewhere; correction and
live Authority/Lease state are not committed or rolled back here. The base
Finality checkpoint must already wrap the active pre-correction Lease head, so
lease-reservation head adoption remains a separate missing predecessor.
Process failure between an earlier correction and this in-memory transaction
is not repaired. Older Finality, Outbox, and adoption Interfaces remain
callable bypasses. CAS remains synchronous and process-local, receipts remain
trusted caller assertions, and FNV hashes remain non-cryptographic. Durable
storage, crash recovery, replication, authentication, signing, send, receipt
acquisition, retry scheduling, protocol, transport, server routing, UI,
results, rewards, Replay Event Ledger presentation, deployment, and Public
Network remain unwired.

## Skyway Exclusive Reconnect Finality Transaction

The pure opt-in Exclusive Reconnect Orchestration Module is the final deep
process-local transaction Seam over reconnect reservation, correction, ACK
creation, and ACK adoption. Its Interface accepts one exact Reconnect Finality
checkpoint and immutable Delivery Finality Watermark with caller CAS hashes,
one authenticated owner with Planner directive/resync projection and first
resumed command, the deterministic environment Adapter, and exactly seven
mutable targets: Lease window, Admission window, Round, Snapshot History,
Command Journal, Replay Event Ledger, and ACK Outbox. It derives the Lease,
correction, post-correction Authority head, ACK Commit, and final checkpoint
internally rather than accepting caller-produced intermediate evidence.

All business Implementations run once on structured scratch state:
Reconnect Lease Finality reservation, Authoritative Reconnect Correction,
Reconnect ACK Commit, and Sequential Reconnect ACK Adoption. The environment
Adapter is called exactly once during that scratch correction. A fresh path
advances the Lease from revision `N` to reserved `N+1` and consumed `N+2`, and
the Outbox from `M` through reservation `M+1`, Authority bridge `M+2`, and ACK
adoption `M+3`. If the exact active Lease is already wrapped by the base
Finality image, reservation is a no-op and the remaining phases consume and
adopt it without reservation revision churn.

Commit uses only two existing restore Interfaces. First it restores the exact
post-correction/pre-ACK Reconnect Authority checkpoint, which owns the Lease
plus the five Authority targets. Second it restores the prepared final Outbox
image. The final Reconnect Finality checkpoint is then recreated from the ACK
Commit checkpoint and live Outbox. Before live mutation, the Module proves
this forward sequence and the complete reverse sequence on clones, rebuilds
the exact base image, freezes and hashes its bounded 640 KiB result, and
rechecks the complete live base. A failure after Authority commit restores
Authority; a failure after both commits restores the abort Outbox first and
base Authority second. Every lower restore Interface preserves existing
top-level and Round nested identities.

This is genuine synchronous process-local atomicity under the documented
restore contracts, not crash atomicity. A process exit between the two live
restores is unrepaired; there is no durable log, cross-process exclusion, or
replication. The guarantee assumes existing restore Implementations do not
throw after their final mutation point. The environment Adapter can mutate
external state; the Module detects live target drift before commit but cannot
undo arbitrary external side effects. The Adapter therefore must be pure for
the transaction guarantee to cover all of its effects.

The Module is “exclusive” only within its Interface: older reservation,
correction, Authority, Outbox, Finality, and adoption Interfaces remain
callable bypasses, and production does not import this Module. Delivery and
receipt finality stay immutable, deterministic Replay events remain staged,
and no presentation, results, rewards, persistence, storage, send, receipt
acquisition, authentication, signing, rate limiting, protocol, transport,
server routing, deployment, UI, or Public Network work is performed. FNV
hashes remain non-authenticating correlation evidence and the authenticated
owner assertion remains caller-trusted.

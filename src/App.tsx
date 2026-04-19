import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Clock, Brain, Users, AlertTriangle, Phone, MessageSquare, Mail, Activity,
  HelpCircle, Play, RotateCcw, ChevronRight, X, Terminal, Search, Radio,
  Wrench, ShieldAlert, Coffee, UserPlus, Zap, Volume2, VolumeX, Keyboard,
  Key, Globe, Trophy, BookOpen, Lock, Server,
} from "lucide-react";

/* ============================================================================
   ESCAPE THE OUTAGE — text-based incident response
   ============================================================================
   Five scenarios. Investigate, commit a root cause, survive the SLA.
   All audience-facing details follow the playbooks SRE/NOC engineers use IRL.
   ========================================================================== */

// ============ SCENARIO DATA ============

const SCENARIOS = {
  fiber: {
    id: "fiber",
    title: "The Midnight Cut",
    tagline: "Multi-circuit outage on the East Metro ring",
    diff: "Moderate",
    sla: 30,
    alert: "MULTI-CIRCUIT OUTAGE · EAST METRO RING · 23 CUSTOMERS IMPACTED",
    opener: [
      "Your phone is buzzing against the nightstand.",
      "Blue glow across the ceiling. 2:47 AM.",
      "PagerDuty. You reach for the laptop before your eyes are fully open.",
    ],
    correct: "fiber_cut",
    backstory: "Two counties over, a contractor's backhoe operator went through a conduit around 2:29 AM. The locate paint had faded. Repair ETA will stretch past sunrise.",
    optimal: ["alarms", "optics", "permits", "dispatch", "reroute"],
    acts: [
      {
        id: "alarms", cat: "investigate", icon: "search",
        label: "Pull up the alarm dashboard", hint: "Quick look at what else is lit up",
        t: 2, f: 4,
        out: { k: "cli", lines: ["CRITICAL  LOS    xe-0/1/3  02:29:14", "CRITICAL  LOS    xe-0/1/4  02:29:14", "CRITICAL  LOS    xe-1/0/0  02:29:15", "CRITICAL  LOS    xe-1/0/1  02:29:15", "... (10 more, all E-METRO ring, within 90s window)"] },
        plain: "14 circuits all lost signal within a 90-second window. Every one of them is on the same physical ring.",
        evid: [{ cat: "scope", txt: "All 14 alarms on East Metro ring — geographic clustering" }, { cat: "timing", txt: "Alarms clustered within 90-second window at 02:29" }, { cat: "symptoms", txt: "Loss of Signal (optical) on all affected interfaces" }],
      },
      {
        id: "tickets", cat: "investigate", icon: "mail",
        label: "Scan the ticket queue", hint: "Who's already called in?",
        t: 1, f: 2,
        out: { k: "ticket", lines: ['7 tickets in last 20 min:', '  • "Internet completely dead" — Meridian Hospital', '  • "Phones and internet out" — Eastside Logistics', '  • "Total outage" — 3x small business', '  • "Also my neighbor lost power" — residential'] },
        plain: "Seven customer reports, all geographically clustered in East Metro. One mentions a power outage — but that's probably a coincidence.",
        evid: [{ cat: "scope", txt: "Customer reports cluster in East Metro area" }],
      },
      {
        id: "changes", cat: "investigate", icon: "wrench",
        label: "Check change management", hint: "Did we push anything recently?",
        t: 3, f: 5,
        out: { k: "cli", lines: ["$ change-log --affected E-METRO --since 7d", "2026-04-10  approved  QoS policy  J. Reyes", "2026-04-12  approved  NTP server  K. Patel", "(no changes in last 96h on affected devices)"] },
        plain: "Nothing was changed on this equipment in the last four days. Rules out a bad config push.",
        evid: [{ cat: "changes", txt: "No recent changes on affected devices (last 96h clean)" }],
      },
      {
        id: "optics", cat: "investigate", icon: "activity",
        label: "Check optical light levels", hint: "Is light getting through?",
        t: 2, f: 5,
        out: { k: "cli", lines: ["xe-0/1/3   Tx: -2.1 dBm   Rx: -40.0 dBm  LOS", "xe-1/0/0   Tx: -2.3 dBm   Rx: -40.0 dBm  LOS", "BACKUP-PATH-A  Tx: -2.0 dBm   Rx: -28.4 dBm  degraded", "BACKUP-PATH-B  Tx: -2.0 dBm   Rx: -19.2 dBm  nominal"] },
        plain: "You're transmitting fine but receiving nothing. The backup paths are also degraded, which points at physical plant — not the equipment itself.",
        evid: [{ cat: "symptoms", txt: "Tx normal, Rx absent — classic signature of a fiber break, not equipment failure" }],
      },
      {
        id: "upstream", cat: "investigate", icon: "radio",
        label: "Check upstream BGP peers", hint: "Maybe it's routing...",
        t: 3, f: 6,
        out: { k: "cli", lines: ["$ show bgp summary", "peer-1    Established  12d 4h    prefixes: 892341", "peer-2    Established  45d 2h    prefixes: 892340", "peer-3    Established   9d 8h    prefixes: 892341", "(all peers nominal, no flaps in 6h)"] },
        plain: "Upstream routing is fine. This rules out a BGP-related cause.",
        evid: [{ cat: "symptoms", txt: "All upstream BGP peers nominal — not a routing issue" }],
      },
      {
        id: "cpu", cat: "investigate", icon: "activity",
        label: "Investigate elevated CPU on core router", hint: "Another alarm caught your eye",
        t: 4, f: 8,
        out: { k: "cli", lines: ["CORE-02  CPU 73%  (normal baseline 22%)", "  top processes:", "    rpd        42%   (routing daemon)", "    fib-push   18%   (forwarding updates)", "Inference: CPU elevated due to reconvergence after", "the ring failure. Effect, not cause."] },
        plain: "This is a red herring. The CPU is high *because* of the outage — the router is doing extra work rerouting traffic. Not the cause.",
        evid: [{ cat: "symptoms", txt: "Elevated core CPU is a downstream effect of reconvergence, not a cause" }],
      },
      {
        id: "permits", cat: "investigate", icon: "search",
        label: "Pull county permit & construction feed", hint: "Anything digging nearby?",
        t: 3, f: 6,
        out: { k: "narrative", lines: ["Scrolling through the regional 811 and emergency work feed...", "", "COUNTY EMERGENCY WORK NOTICE — filed 02:41 AM", "Water main break, Elm St between 4th and 9th.", "Emergency excavation in progress.", "", "Your primary East Metro path follows Elm St."] },
        plain: "A water main broke two counties over and someone dug in the middle of the night. Your primary fiber path goes right through the work zone.",
        evid: [{ cat: "changes", txt: "Emergency excavation on Elm St — primary fiber route — started near time of outage" }],
      },
      {
        id: "dispatch", cat: "act", icon: "userplus",
        label: "Dispatch field tech to Elm St", hint: "Eyes on the physical plant",
        t: 2, f: 3, req: ["permits"],
        out: { k: "narrative", lines: ["Field tech acknowledges dispatch.", "ETA to Elm St: 35 minutes.", 'Reply: "If it\'s where you think it is, this is a classic cut. I\'ll bring the OTDR."'] },
        plain: "Field tech is on the way. They'll confirm the break when they arrive.",
        evid: [{ cat: "symptoms", txt: "Field tech en route to suspected cut location" }],
      },
      {
        id: "reroute", cat: "act", icon: "zap",
        label: "Reroute traffic through backup POP", hint: "Restore service now, investigate later",
        t: 4, f: 10,
        out: { k: "cli", lines: ["$ commit confirmed 5", "committing...", "traffic rerouting via backup POP (BACKUP-PATH-B)", "  - 18 of 23 customers restored", "  - 5 circuits still down (capacity exceeded on backup)", "commit confirmed"] },
        plain: "Pushed a config that reroutes traffic around the broken path. Most customers back up. Five still out — backup doesn't have enough capacity.",
        evid: [{ cat: "symptoms", txt: "Manual reroute restored 18/23 customers via backup path" }],
        restore: true,
      },
      {
        id: "escalate", cat: "escalate", icon: "phone",
        label: "Call senior engineer", hint: "Costs credibility but buys a hint",
        t: 10, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: ['Senior eng picks up on ring 4. Groggy.', '"Geographic clustering on the same ring, Tx normal Rx zero? That\'s physical plant. Don\'t waste time on routing — check the path. And look at construction permits, I\'ve seen this three times this year."'] },
        plain: "Senior engineer points you at the physical layer and construction permits.",
      },
      {
        id: "cowboy", cat: "act", icon: "shieldalert",
        label: "Force-reset affected interfaces", hint: "Aggressive. Might clear it...",
        t: 3, f: 8, once: true,
        out: { k: "cli", lines: ["$ configure", "$ set interfaces xe-0/1/3 disable", "$ set interfaces xe-0/1/4 disable", "$ commit", "...", "ERROR: 3 additional circuits dropped during reconvergence", "ALARM: secondary outage triggered — now 31 customers impacted"] },
        plain: "You tried to force-reset interfaces that were already dead. Instead, you caused a secondary outage on healthy circuits. Now it's worse.",
        worse: true,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "Restore focus. Costs a bit of time.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["Hot water, grounds, inhale. The fog lifts a little.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 6, line: "Tier 1: '12 tickets now. Meridian's CIO is on hold.'" },
      { at: 12, line: "Slack #incidents has 19 people in it. Someone is asking about the runbook." },
      { at: 20, line: "Twitter: @meridian_health retweeted 'is your internet working?' Tier 1 is screenshotting." },
    ],
    intr: [
      {
        id: "director", at: 8, icon: "phone",
        title: "The VP of Operations is calling.",
        body: '"I\'ve got the sales director blowing up my phone. Meridian Hospital is on the line with him. What do I tell them?"',
        choices: [
          { label: "Give an honest status update", eff: { t: 1, cred: 5 }, resp: '"Fiber path likely cut, field tech dispatched, ETA on confirmation 35 min. Restoration options being evaluated." — "OK, that I can work with."' },
          { label: "Say you're still investigating", eff: { t: 0, cred: -5 }, resp: '"I hear you. Call me back the minute you know something."' },
          { label: "Promise restoration in 15 minutes", eff: { t: 0, cred: -20 }, resp: '"Fifteen minutes. I\'m holding you to that." (...that was optimistic.)' },
          { label: "Send it to voicemail", eff: { t: 0, cred: -15 }, resp: "Four missed calls and counting." },
        ],
      },
      {
        id: "hospital", at: 18, icon: "alert",
        title: "Tier 1 is pinging you on Slack.",
        body: '"Meridian Hospital IT director just called directly. Says they have patient monitoring on this circuit. He is not calm."',
        choices: [
          { label: "Take the call yourself", eff: { t: 4, cred: 10 }, resp: "Three minutes of reassurance. He exhales. Says their failover is working but barely." },
          { label: "Have Tier 1 read a canned update", eff: { t: 1, cred: 0 }, resp: "Tier 1 relays the status. It lands OK." },
          { label: "Escalate to the VP so they can handle it", eff: { t: 1, cred: -5 }, resp: "VP is displeased. But the hospital gets a call." },
        ],
      },
    ],
    diag: [
      { id: "fiber_cut", label: "Physical fiber cut on primary path (construction-related)" },
      { id: "bgp", label: "Upstream BGP peer failure" },
      { id: "power", label: "Power failure at customer POPs" },
      { id: "core_router", label: "Core router hardware failure (elevated CPU)" },
      { id: "maint", label: "Unannounced carrier maintenance window" },
    ],
  },

  ghost: {
    id: "ghost",
    title: "Ghost Peer",
    tagline: "Upstream peer flapping, 847 customers impacted",
    diff: "Hard",
    sla: 25,
    alert: "BGP PEER DOWN · AS64512 · SESSION FLAPPING · INTERMITTENT IMPACT",
    opener: [
      "The Slack notification sound.",
      "Then PagerDuty. Then a text. Then another.",
      "2:47 AM. Your incident channel already has four messages in it from the Tier 1 who's been watching this for fifteen minutes.",
    ],
    correct: "upstream_maint",
    backstory: "An engineer at your upstream carrier did an unannounced line card swap at 02:29. Their change control ticket was filed but the customer notification never got sent — it's still sitting in a draft folder on someone's laptop.",
    optimal: ["bgp_state", "our_changes", "tickets", "call_upstream", "reroute"],
    acts: [
      {
        id: "bgp_state", cat: "investigate", icon: "search",
        label: "Check BGP session state", hint: "What's the peer doing?",
        t: 2, f: 4,
        out: { k: "cli", lines: ["$ show bgp neighbor 64512 | match state|timer", "peer AS64512  state: Active  (was Established)", "  flaps last hour: 8", "  last down: 02:44  (hold timer expired)", "  last up:   02:41", "  cycle: ~4 min up, ~45s down"] },
        plain: "The peer session keeps coming up and going down every few minutes. This started at 02:29 — 16 minutes before the alert fired.",
        evid: [{ cat: "timing", txt: "Peer started flapping at 02:29 — well before alert fired" }, { cat: "symptoms", txt: "BGP session cycling: ~4 min up, ~45s down" }],
      },
      {
        id: "tickets", cat: "investigate", icon: "mail",
        label: "Check tickets and customer reports", hint: "What are customers seeing?",
        t: 1, f: 2,
        out: { k: "ticket", lines: ["18 tickets filed in last 25 min:", "  • Intermittent slowness (9)", "  • TCP timeouts / sessions resetting (6)", "  • Video calls dropping (3)", "No one reports total outage. Just... bad."] },
        plain: "Customers aren't completely down — they're experiencing intermittent problems. That matches a flapping session, not a hard failure.",
        evid: [{ cat: "scope", txt: "847 customers, intermittent impact (not hard down)" }],
      },
      {
        id: "carrier_portal", cat: "investigate", icon: "search",
        label: "Log into upstream carrier's portal", hint: "Any posted maintenance?",
        t: 4, f: 6,
        out: { k: "narrative", lines: ["Password manager... two-factor... loading status page...", "", "Network Status: ✓ All Systems Operational", "Last posted advisory: 3 days ago", "", "(nothing posted for tonight)"] },
        plain: "Their public status page shows everything as normal. Nothing posted about maintenance.",
        evid: [{ cat: "changes", txt: "Upstream carrier status page shows no posted maintenance" }],
      },
      {
        id: "email", cat: "investigate", icon: "mail",
        label: "Search inbox for maintenance notices", hint: "Did we get an email we missed?",
        t: 3, f: 5,
        out: { k: "narrative", lines: ['Searching: from:(@upstream-carrier) subject:(maintenance OR change)', "", "Most recent: 11 days ago (routine, completed).", "Nothing scheduled for this week.", "", "...though you note the sender sometimes comes from a different domain for emergencies."] },
        plain: "No maintenance notice in your inbox from the upstream carrier. But they occasionally send urgent ones from a different address.",
        evid: [{ cat: "changes", txt: "No maintenance notification received in the last 11 days" }],
      },
      {
        id: "our_changes", cat: "investigate", icon: "wrench",
        label: "Check our recent config changes", hint: "Did we break this?",
        t: 3, f: 5,
        out: { k: "cli", lines: ["$ change-log --peer AS64512 --since 14d", "(no changes to this peer in 14 days)", "$ change-log --edge-routers --since 48h", "(no changes in 48h)"] },
        plain: "We haven't changed anything that could affect this peer. It's not us.",
        evid: [{ cat: "changes", txt: "No local config changes touching this peer in 14 days" }],
      },
      {
        id: "ddos", cat: "investigate", icon: "shieldalert",
        label: "Check for DDoS signature", hint: "Could be an attack...",
        t: 4, f: 8,
        out: { k: "cli", lines: ["$ traffic-analyzer --peer AS64512 --last 30m", "ingress spikes during 'up' windows — but normal distribution", "no single-source dominance", "no common attack signatures", "Inference: spikes are queued traffic bursting when", "peer recovers. Not an attack, a symptom."] },
        plain: "Traffic looks spiky but in a totally normal way — traffic piling up during 'down' windows and rushing through when the peer comes back. Not a DDoS. Red herring.",
        evid: [{ cat: "symptoms", txt: "Traffic bursts are queued traffic recovery — not attack signature" }],
      },
      {
        id: "call_upstream", cat: "escalate", icon: "phone",
        label: "Call the upstream carrier's NOC", hint: "Talk to a human on their side",
        t: 6, f: 6,
        out: { k: "narrative", lines: ['On hold for four minutes. Eventually:', '', '"Hey, yeah, we\'ve got — hold on — yeah, line card swap on the edge router that faces you. Started at 02:29. Should\'ve been transparent but the backup card is having negotiation issues. We\'re seeing flaps our side too."', '', '"Did you get our notification?"', '"...no."', '"Hm. Let me check. ...oh. Oh, that\'s in someone\'s drafts folder. I\'m so sorry."'] },
        plain: "The upstream carrier is doing a hardware swap that should have been seamless but isn't. Their maintenance notification was never sent — it's sitting in a draft.",
        evid: [{ cat: "changes", txt: "Upstream carrier confirmed unannounced line card swap at 02:29" }],
      },
      {
        id: "reroute", cat: "act", icon: "zap",
        label: "Shift traffic to secondary upstream peer", hint: "Route around the flapping peer",
        t: 5, f: 10,
        out: { k: "cli", lines: ["$ configure", "$ set policy-options prefix-list BAD-PEER disable", "$ set routing-options preference secondary-peer +10", "$ commit", "traffic shifting... 92% of flows now via secondary peer", "customer impact: resolving"] },
        plain: "De-preferenced the flapping peer and pushed traffic to your secondary upstream. Connectivity stabilizing.",
        evid: [{ cat: "symptoms", txt: "Traffic shifted off flapping peer — connectivity stabilizing" }],
        restore: true,
      },
      {
        id: "escalate", cat: "escalate", icon: "userplus",
        label: "Call senior engineer", hint: "Costs credibility, buys a hint",
        t: 10, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: ['Senior eng, sleepy: "Flapping peer, intermittent impact, no changes our side? Nine times out of ten that\'s their problem. Call their NOC. If their portal shows green, don\'t trust it — the portal lags reality by an hour."'] },
        plain: "Senior engineer tells you to call the upstream carrier directly and not trust the status page.",
      },
      {
        id: "cowboy", cat: "act", icon: "shieldalert",
        label: "Hard-reset the BGP session on our side", hint: "Maybe force a clean restart fixes it",
        t: 3, f: 8, once: true,
        out: { k: "cli", lines: ["$ clear bgp neighbor 64512 soft", "session resetting...", "session established", "(30 seconds later)", "session down again", "(45 seconds later)", "session established", "WARN: route churn from reset caused a secondary flap on transit peer"] },
        plain: "Reset from your side. It came back and went down again immediately — because the problem isn't on your side. Worse: the churn from your reset spooked another peer.",
        worse: true,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "Restore focus.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["The smell alone helps. Then the caffeine.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 5, line: "Tier 1: 'Trading desk at Northridge Capital just called. They are, quote, losing money by the second.'" },
      { at: 11, line: "Looking glass from a peer shows your prefixes flapping from their side too." },
      { at: 18, line: "#incidents: 'anyone else seeing this?' — yes, anyone who peers with AS64512 is." },
    ],
    intr: [
      {
        id: "security", at: 7, icon: "alert",
        title: "VP of Engineering is paging you.",
        body: '"Is this a security incident? Do I need to wake up the security team?"',
        choices: [
          { label: "Not yet — looks like an upstream/routing issue", eff: { t: 1, cred: 5 }, resp: '"OK. Keep me posted. Don\'t make me guess."' },
          { label: "Possibly, still investigating", eff: { t: 2, cred: -5 }, resp: "The security team gets paged unnecessarily. They're not thrilled." },
          { label: "Yes, definitely", eff: { t: 3, cred: -15 }, resp: "Security team incident bridge spins up. This is going to be an awkward post-mortem." },
        ],
      },
      {
        id: "customer", at: 16, icon: "phone",
        title: "Enterprise customer on the line.",
        body: '"We run a trading platform. Every one of these 45-second drops is a problem. What\'s your ETA?"',
        choices: [
          { label: "Give a realistic ETA (after you call upstream)", eff: { t: 3, cred: 10 }, resp: "They're not happy, but they respect the straight answer." },
          { label: "Stall: 'investigating, updates soon'", eff: { t: 1, cred: -5 }, resp: "They hang up. They'll call back." },
          { label: "Offer to reroute them proactively", eff: { t: 2, cred: 5 }, resp: "They appreciate it. You'd better follow through." },
        ],
      },
    ],
    diag: [
      { id: "upstream_maint", label: "Unannounced upstream carrier maintenance / hardware swap" },
      { id: "ddos", label: "DDoS attack against our infrastructure" },
      { id: "our_bgp", label: "BGP misconfiguration on our side" },
      { id: "physical", label: "Physical layer issue at the peering point" },
      { id: "hijack", label: "Route hijack / prefix leak" },
    ],
  },

  angry: {
    id: "angry",
    title: "The Angry Customer",
    tagline: "P1 escalation — high-value customer swearing at Tier 1",
    diff: "Tricky",
    sla: 20,
    alert: "P1 ESCALATION · NORTHRIDGE FINANCIAL · TOTAL OUTAGE · 40 MIN DURATION",
    opener: [
      "Your phone. Tier 1 is calling directly. That's never good.",
      '"Hey — sorry to wake you. Northridge Financial. Customer is... not calm. Says they\'ve been down forty minutes. Can you take a look?"',
      "2:47 AM. You already know this one is going to be political before you even log in.",
    ],
    correct: "customer_side",
    backstory: "Northridge's new third-party IT contractor pushed firewall rule changes at 02:07 AM without notifying anyone. The rules silently dropped all outbound traffic. The contractor is asleep with their phone on silent. The Northridge IT director genuinely doesn't know.",
    optimal: ["our_side", "flows", "cpe_stats", "call_customer", "offer_remote"],
    acts: [
      {
        id: "our_side", cat: "investigate", icon: "search",
        label: "Check circuit status from our side", hint: "Is it actually down?",
        t: 2, f: 4,
        out: { k: "cli", lines: ["$ show interface xe-2/1/3 | match status|rx|tx", "status: up/up", "Rx: -3.1 dBm (nominal)", "Tx: -2.8 dBm (nominal)", "errors: 0", "uptime: 47 days 14 hours"] },
        plain: "The physical circuit is perfectly fine. Interface is up, light levels normal, no errors, no recent flap. It has not gone down in 47 days.",
        evid: [{ cat: "symptoms", txt: "Our-side circuit: up, clean, no errors, 47-day uptime" }],
      },
      {
        id: "ping_cpe", cat: "investigate", icon: "activity",
        label: "Ping customer CPE", hint: "Is their router alive?",
        t: 1, f: 2,
        out: { k: "cli", lines: ["$ ping 10.42.18.1 count 20", "20 packets transmitted, 20 received, 0% loss", "round-trip min/avg/max = 2.1/2.4/3.0 ms"] },
        plain: "The customer's router responds perfectly. It's alive and reachable over our circuit.",
        evid: [{ cat: "symptoms", txt: "Customer CPE responds to ping with 0% loss — their edge device is up" }],
      },
      {
        id: "flows", cat: "investigate", icon: "activity",
        label: "Check traffic flow history", hint: "When did traffic actually stop?",
        t: 3, f: 6,
        out: { k: "cli", lines: ["$ flow-stats customer:northridge --last 2h", "02:00  ingress: 48 Mbps   egress: 31 Mbps   NORMAL", "02:05  ingress: 50 Mbps   egress: 33 Mbps   NORMAL", "02:07  ingress: 2 Mbps    egress: 33 Mbps   ANOMALY", "02:08  ingress: 0 Mbps    egress: 31 Mbps   ANOMALY", "02:45  ingress: 0 Mbps    egress: 28 Mbps   ongoing"] },
        plain: "Traffic coming FROM the customer stopped at 02:07. But we're still sending traffic TO them and they're receiving it. Whatever happened, it's on their side blocking outbound.",
        evid: [{ cat: "timing", txt: "Customer egress stopped at 02:07 — ingress still flowing" }, { cat: "symptoms", txt: "Asymmetric failure: we can send to customer, they can't send out" }],
      },
      {
        id: "history", cat: "investigate", icon: "search",
        label: "Review customer support history", hint: "Any patterns?",
        t: 2, f: 3,
        out: { k: "narrative", lines: ["Last 60 days of Northridge tickets:", "  • 3 tickets — user-error-type issues", "  • 1 mention: 'new IT contractor onboarding Q2'", "  • Note on file: 'customer has limited in-house expertise, lean on them patiently'", "No pattern of circuit issues. Clean record before the contractor arrived."] },
        plain: "Clean history until recently. Note mentions a new IT contractor started this quarter.",
        evid: [{ cat: "changes", txt: "Customer onboarded new third-party IT contractor recently" }],
      },
      {
        id: "ring_flap", cat: "investigate", icon: "activity",
        label: "Investigate the 02:15 ring flap", hint: "There was a small blip on our ring...",
        t: 4, f: 8,
        out: { k: "cli", lines: ["Ring protection event at 02:15:22", "affected segment: NOT in customer's path", "duration: 340ms", "customers impacted: 0 (sub-SLA blip)", "Inference: real event, but coincidental and", "geographically unrelated to Northridge."] },
        plain: "There was a small blip on our network at 02:15, but it was on a totally different path. Coincidence. Red herring.",
        evid: [{ cat: "symptoms", txt: "Unrelated ring flap at 02:15 — different path, 340ms duration, coincidental" }],
      },
      {
        id: "cpe_stats", cat: "investigate", icon: "activity",
        label: "Check CPE interface & CPU from our side", hint: "SNMP poll their device",
        t: 3, f: 5,
        out: { k: "cli", lines: ["SNMP poll 10.42.18.1:", "  CPU: 18% (nominal)", "  Memory: 34% (nominal)", "  Interface ge0/0 (to us): up, clean", "  Interface ge0/1 (to LAN): up, clean", "  LAST CONFIG CHANGE: 02:06:48 (40 minutes ago)"] },
        plain: "Their router is healthy. But someone changed its configuration 40 minutes ago — one minute before the traffic stopped.",
        evid: [{ cat: "changes", txt: "Customer CPE config was modified at 02:06, one minute before egress dropped" }, { cat: "timing", txt: "Config change timing lines up exactly with traffic stop" }],
      },
      {
        id: "call_customer", cat: "escalate", icon: "phone",
        label: "Call the customer yourself", hint: "Sometimes you just gotta",
        t: 5, f: 8,
        out: { k: "narrative", lines: ['Northridge IT Director picks up, already frustrated.', '', 'You: "Our side shows the circuit clean and our monitoring shows your router\'s config was changed at 02:06. Any idea what that change was?"', '', 'Long pause.', '', '"...our contractor was doing some firewall work earlier tonight. He said it would be transparent. He\'s not answering his phone."'] },
        plain: "The customer had no idea their contractor pushed changes. This is a customer-side issue.",
        evid: [{ cat: "changes", txt: "Customer confirms third-party contractor made firewall changes around 02:06" }],
      },
      {
        id: "dispatch", cat: "act", icon: "userplus",
        label: "Dispatch field tech to customer site", hint: "Eyes-on at the demarc",
        t: 3, f: 4,
        out: { k: "narrative", lines: ['Field tech en route. 45 min ETA.', '', '(You wonder if this is the best use of resources given the evidence...)'] },
        plain: "Dispatched a tech. If this turns out to be a customer-side config issue, that's a billable trip with no useful outcome.",
        cred: -5,
      },
      {
        id: "offer_remote", cat: "act", icon: "wrench",
        label: "Offer to help customer review firewall config", hint: "Play support, earn goodwill",
        t: 4, f: 6, req: ["call_customer"],
        out: { k: "narrative", lines: ['Screenshare with the IT director. You walk through the device\'s most recent firewall commits:', '', '  02:06:48  policy POLICY-EGRESS modified', '    added: deny any any log', '    (above the permit rules)', '', 'An implicit-deny rule above all the permit rules. Classic rookie mistake — the contractor clearly fat-fingered the ordering.'] },
        plain: "The contractor added a deny-all rule above the allow rules. Classic ordering mistake. Fixing it.",
        evid: [{ cat: "symptoms", txt: "Root cause identified: misordered firewall rules on customer CPE" }],
        restore: true,
      },
      {
        id: "escalate", cat: "escalate", icon: "userplus",
        label: "Call senior engineer", hint: "Costs credibility, buys a hint",
        t: 8, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: ['Senior eng: "Asymmetric traffic, our side clean, their CPE pingable? Look at their last config change timestamp. If it\'s close to the incident time, it\'s them. Don\'t let them pressure you into chasing ghosts on our side."'] },
        plain: "Senior engineer: check their config change timestamps, don't let pressure push you to chase the wrong layer.",
      },
      {
        id: "cowboy", cat: "act", icon: "shieldalert",
        label: "Bounce the circuit to 'try a reset'", hint: "Customer demands action...",
        t: 3, f: 6, once: true,
        out: { k: "cli", lines: ["$ request interface xe-2/1/3 down && up", "interface flapping...", "customer reports total loss of inbound traffic during reset", "customer IT director: 'ARE YOU KIDDING ME'", "session restored, problem unchanged"] },
        plain: "You bounced a circuit that was fine. It took the customer's inbound traffic down for 20 seconds during the reset. Their director is now apocalyptic. The underlying problem is still there.",
        worse: true,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "Restore focus.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["Bitter. Hot. Helping.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 4, line: "Slack DM from your manager: 'I'm watching this one. Loop me in when you have something.'" },
      { at: 9, line: "Account manager in #northridge-war-room: 'anything I can relay?'" },
      { at: 15, line: "The customer just tweeted about 'our ISP'. It's not complimentary." },
    ],
    intr: [
      {
        id: "account_mgr", at: 6, icon: "phone",
        title: "Account manager is calling.",
        body: '"Northridge pays us six figures a year. Their CIO just texted our CEO. I don\'t care whose fault it is — I need something I can tell them."',
        choices: [
          { label: "Share what you know factually", eff: { t: 2, cred: 10 }, resp: '"Our circuit is clean, their CPE config changed right before the outage. Got it. I\'ll relay it diplomatically."' },
          { label: "Say it 'looks like their side' without evidence yet", eff: { t: 1, cred: -10 }, resp: "Account manager is skeptical and frustrated. You're making a claim you can't fully support yet." },
          { label: "Tell them to give you 10 more minutes", eff: { t: 0, cred: -5 }, resp: '"Fine. Ten. Not eleven."' },
        ],
      },
      {
        id: "manager", at: 14, icon: "alert",
        title: "Your manager pings.",
        body: '"This is a Tier 1 account. Treat it like one. What are you finding?"',
        choices: [
          { label: "Run the evidence trail you have", eff: { t: 2, cred: 10 }, resp: '"Solid work. Keep the customer looped in as you confirm."' },
          { label: "Say you're being thorough, no conclusions yet", eff: { t: 1, cred: -5 }, resp: '"Thorough is good. Faster is better. Update me in 10."' },
        ],
      },
    ],
    diag: [
      { id: "customer_side", label: "Customer-side configuration change (their contractor / their firewall)" },
      { id: "our_circuit", label: "Our circuit has failed" },
      { id: "ring_event", label: "Our 02:15 ring flap caused the outage" },
      { id: "cpe_hardware", label: "Customer CPE hardware failure" },
      { id: "upstream_route", label: "Upstream routing issue affecting customer" },
    ],
  },

  dns: {
    id: "dns",
    title: "Resolve This",
    tagline: "Authoritative DNS intermittent SERVFAIL — 1,200+ customers",
    diff: "Hard",
    sla: 22,
    alert: "AUTHORITATIVE DNS · INTERMITTENT SERVFAIL · RESOLVING AT ~62%",
    opener: [
      "Your phone. Then your laptop. Then your phone again.",
      'Tier 1 is already in the channel: "Support is drowning. Customers saying the internet\'s broken, but only for some sites. And the sites change."',
      "You log in. Auth dashboard is green. BGP is green. Somewhere, something is lying.",
    ],
    correct: "dnssec_rollover",
    backstory: "A scheduled DNSSEC KSK rollover completed the key-signing step at 01:30 AM. The new DS record was staged at the parent registrar but the publish button was never pressed — the handoff ticket from the afternoon is still open on someone's laptop, at home. Validating resolvers around the internet now treat half your zones as bogus. Non-validating resolvers are fine, which is why reports are inconsistent and maddening.",
    optimal: ["resolver_logs", "dig_test", "recent_ops", "check_parent", "emergency_rollback"],
    acts: [
      {
        id: "resolver_logs", cat: "investigate", icon: "search",
        label: "Tail the authoritative query log", hint: "What queries are we actually serving?",
        t: 2, f: 4,
        out: { k: "cli", lines: [
          "$ tail -f /var/log/named/queries.log",
          "02:47:12  client 8.8.8.8   example-zone.net  A     NOERROR",
          "02:47:13  client 1.1.1.1   svc.example.com   A     NOERROR",
          "02:47:13  client 9.9.9.9   svc.example.com   A     *truncated response path*",
          "02:47:14  client 1.1.1.1   svc.example.com  DNSKEY NOERROR  (answers served)",
          "(note: we're answering. The resolvers upstream are the ones returning SERVFAIL to clients.)"
        ] },
        plain: "We're happily answering queries. DNSKEY records are being served. The SERVFAIL is happening at downstream *resolvers*, not at us. That's a validation problem.",
        evid: [{ cat: "symptoms", txt: "We serve all queries NOERROR; SERVFAIL appears only at validating resolvers" }],
      },
      {
        id: "dig_test", cat: "investigate", icon: "activity",
        label: "dig +dnssec against public resolvers", hint: "Reproduce the failure",
        t: 3, f: 5,
        out: { k: "cli", lines: [
          "$ dig @1.1.1.1 svc.example.com +dnssec +cd",
          ";; ->>HEADER<<- status: NOERROR",
          "",
          "$ dig @1.1.1.1 svc.example.com +dnssec",
          ";; ->>HEADER<<- status: SERVFAIL",
          ";; extended DNS error: 6 (DNSSEC Bogus)",
          "",
          "(CD-bit (checking disabled) works. Validating queries fail with 'DNSSEC Bogus'.)"
        ] },
        plain: "The +cd flag disables DNSSEC validation — and the query works. Without it, resolvers get 'DNSSEC Bogus'. This is unambiguous: a validation failure, not a service availability issue.",
        evid: [{ cat: "symptoms", txt: "Query works with +cd (validation disabled), fails with 'DNSSEC Bogus' otherwise" }],
      },
      {
        id: "capacity", cat: "investigate", icon: "activity",
        label: "Check authoritative server load", hint: "Are we overwhelmed?",
        t: 3, f: 6,
        out: { k: "cli", lines: [
          "$ dns-stats --ns auth1,auth2,auth3 --last 15m",
          "auth1   qps:  14,200    cache: n/a   cpu: 31%    (nominal)",
          "auth2   qps:  13,800    cache: n/a   cpu: 29%    (nominal)",
          "auth3   qps:  14,400    cache: n/a   cpu: 33%    (nominal)",
          "NXDOMAIN rate normal. No REFUSED. No SERVFAIL from us.",
        ] },
        plain: "Auth servers are healthy. Not a capacity or DoS problem on our end. Red herring if you were suspecting load.",
        evid: [{ cat: "symptoms", txt: "Auth servers nominal — no SERVFAIL or REFUSED originating from us" }],
      },
      {
        id: "recent_ops", cat: "investigate", icon: "wrench",
        label: "Check recent DNS ops runbook entries", hint: "What changed in zone mgmt?",
        t: 2, f: 4,
        out: { k: "cli", lines: [
          "$ opsbook --tag dns --since 48h",
          "2026-04-18 14:02  KSK rollover — prep    (K. Lin)   status: COMPLETE",
          "2026-04-19 01:30  KSK rollover — sign    (K. Lin)   status: COMPLETE",
          "2026-04-19 01:45  Publish DS at parent   (???)      status: PENDING  ⚠",
          "(the publish step is still pending.)",
        ] },
        plain: "A DNSSEC key rollover was done tonight. The key-signing step completed at 01:30 — but the step that publishes the new key fingerprint at the parent registrar is still marked PENDING. That's the smoking gun.",
        evid: [{ cat: "changes", txt: "DNSSEC KSK rollover started 01:30; parent DS publish step still PENDING" }, { cat: "timing", txt: "KSK rollover at 01:30 — 77 min before alert fired (matches cache expiry windows)" }],
      },
      {
        id: "check_parent", cat: "investigate", icon: "search",
        label: "Query parent zone for our DS records", hint: "What does .net have for us?",
        t: 3, f: 5,
        out: { k: "cli", lines: [
          "$ dig @a.gtld-servers.net example-zone.net DS",
          ";; ANSWER SECTION:",
          "example-zone.net. 86400  IN  DS  12345 13 2  a1b2...  ← OLD key fingerprint",
          "",
          "(the parent is still advertising the *old* DS. Our auth servers now sign with the *new* KSK. Chain of trust is broken at the parent.)",
        ] },
        plain: "The parent zone (.net) is still advertising the DS record for our OLD key. But we're now signing with the NEW key. The chain of trust is broken. Validating resolvers correctly reject our answers as bogus.",
        evid: [{ cat: "changes", txt: "Parent registrar DS record still references old KSK — chain of trust broken" }],
      },
      {
        id: "bgp_herring", cat: "investigate", icon: "radio",
        label: "Check for BGP anomalies", hint: "Could traffic be landing weird?",
        t: 3, f: 6,
        out: { k: "cli", lines: [
          "$ show bgp summary",
          "(all peers nominal)",
          "$ route-views --prefix 203.0.113.0/24 --origin ASxxxx",
          "origin stable, propagation normal",
          "no hijack, no leak.",
        ] },
        plain: "BGP is fine. Not a routing issue. Red herring.",
        evid: [{ cat: "symptoms", txt: "BGP nominal — prefixes propagating correctly, no hijacks" }],
      },
      {
        id: "call_lin", cat: "escalate", icon: "phone",
        label: "Call K. Lin (the DNS ops engineer from the ticket)", hint: "They did the rollover",
        t: 4, f: 4,
        out: { k: "narrative", lines: [
          'Three rings. Groggy voice.',
          '',
          '"Hello?"',
          '"Hey — sorry, quick one. KSK rollover from tonight. Did you submit the DS publish to the registrar?"',
          '',
          'A pause that lasts exactly as long as your career flashing before their eyes.',
          '',
          '"...I handed it off. To the on-call ticket. I thought — oh. Oh no. Oh NO. The ticket is still on my laptop screen at home. I never filed it."',
        ] },
        plain: "Confirmed. The DS publish step was never actually executed. Human handoff failure.",
        evid: [{ cat: "changes", txt: "DNS ops engineer confirms parent DS publish was never submitted to registrar" }],
      },
      {
        id: "emergency_rollback", cat: "act", icon: "key",
        label: "Emergency: re-sign zones with OLD KSK, hold new one", hint: "Fastest path: match what's at the parent",
        t: 5, f: 10,
        out: { k: "cli", lines: [
          "$ keymgr zone example-zone.net promote-zsk OLD-KSK",
          "$ keymgr zone example-zone.net retire NEW-KSK --hold 48h",
          "$ zone-signer --all --publish",
          "signing 47 zones with OLD-KSK... done.",
          "NOTIFY sent to secondaries. TTL on RRSIGs: 3600.",
          "expect recovery to propagate over next 5-60 minutes as resolvers re-query.",
        ] },
        plain: "Rolled back to signing with the key whose DS record is still at the parent. Validation will recover as negative-cached failures time out (few minutes to ~1 hour, depending on resolver).",
        evid: [{ cat: "symptoms", txt: "Zones re-signed with old KSK whose DS is still published — chain of trust restored" }],
        restore: true,
      },
      {
        id: "publish_ds", cat: "act", icon: "key",
        label: "Push the DS record at the registrar now", hint: "Forward: finish what was started",
        t: 8, f: 10,
        out: { k: "cli", lines: [
          "Logging into registrar portal...",
          "Zone: example-zone.net",
          "Updating DS set...",
          "  old DS: 12345 13 2 a1b2...",
          "  new DS: 24680 13 2 c3d4...",
          "SUBMITTED.",
          "(parent TTL 86400. This will propagate in hours, not minutes. Resolvers may still fail validation for a while.)",
        ] },
        plain: "Submitted the DS update to the registrar. BUT — the TTL on the parent zone is 24 hours. This takes hours to fully propagate. Customers stay broken in the meantime.",
        evid: [{ cat: "symptoms", txt: "DS published at registrar, but 24h TTL means slow propagation" }],
      },
      {
        id: "senior", cat: "escalate", icon: "userplus",
        label: "Call the senior DNS engineer", hint: "Costs credibility, gains a pointer",
        t: 10, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: [
          '"Intermittent SERVFAIL that only hits validating resolvers? Nine times in ten that\'s DNSSEC. Check whether the DS at the parent matches what you\'re signing with. And if you just rolled a KSK, roll it *back* — do not wait for the registrar TTL."',
        ] },
        plain: "Senior engineer: DNSSEC validation failure, rollback to the key matching the parent's DS — don't wait on the registrar.",
      },
      {
        id: "cowboy", cat: "act", icon: "shieldalert",
        label: "Flush and restart all authoritative servers", hint: "Clear caches, try your luck",
        t: 4, f: 9, once: true,
        out: { k: "cli", lines: [
          "$ rndc flush && systemctl restart named",
          "(on auth1, auth2, auth3 in parallel)",
          "auth1: restarting... reloading 47 zones... 11 zones failed to load (missing RRSIG)",
          "auth2: restarting... process segfault on zone load",
          "auth3: restarting... 47 zones loaded (OK)",
          "ALARM: 2 of 3 auth servers degraded; resolver traffic shedding to auth3 only",
        ] },
        plain: "You restarted authoritative servers that didn't have a caching problem. Two of them came back degraded. You made it much worse.",
        worse: true,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "Restore focus.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["Bitter and black. The SERVFAIL scrolling past looks less malicious now.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 4, line: "#incidents: 'Hacker News is noticing. Top of front page in 40 minutes at this rate.'" },
      { at: 9, line: "Tier 1: 'Resolver guys at a tier-1 ISP just called. Said we\\'re on their watch list.'" },
      { at: 15, line: "Your CEO just forwarded a tweet from a customer calling your service 'comically broken'." },
    ],
    intr: [
      {
        id: "security", at: 6, icon: "alert",
        title: "Security lead is paging you.",
        body: '"Sudden DNS failures? Could this be a cache poisoning attack or a rogue signer? Do we wake up incident response?"',
        choices: [
          { label: "Not yet — signatures look like a validation failure, not an attack", eff: { t: 1, cred: 5 }, resp: '"OK. Tell me the moment that changes."' },
          { label: "Possibly — spinning up IR as a precaution", eff: { t: 3, cred: -5 }, resp: "IR bridge opens. You'll be justifying this later." },
          { label: "Dismiss — 'not security, trust me'", eff: { t: 0, cred: -10 }, resp: "They don't love that framing." },
        ],
      },
      {
        id: "peer", at: 13, icon: "phone",
        title: "A peer ISP's NOC is calling.",
        body: '"Your zones are failing validation for us. Are you mid-rollover? We\'ve seen this before."',
        choices: [
          { label: "Confirm the issue, promise a rollback ETA", eff: { t: 2, cred: 10 }, resp: '"Appreciate the candor. Call us when it\'s done, we\'ll verify from our side."' },
          { label: "Say you're still investigating", eff: { t: 1, cred: -5 }, resp: "'...OK. We'll bypass validation for your prefixes locally. Don't make us do this often.'" },
        ],
      },
    ],
    diag: [
      { id: "dnssec_rollover", label: "Failed DNSSEC KSK rollover — parent DS mismatch" },
      { id: "cache_poison", label: "Cache poisoning / resolver attack" },
      { id: "auth_capacity", label: "Authoritative server capacity / DoS" },
      { id: "bgp_hijack", label: "BGP hijack of authoritative prefix" },
      { id: "zone_corruption", label: "Zone file corruption on authoritative servers" },
    ],
  },

  cert: {
    id: "cert",
    title: "Silent Expiry",
    tagline: "Internal API mesh 500s — no deploy, no network change",
    diff: "Moderate",
    sla: 25,
    alert: "PAYMENTS-API · 500/502 SURGE · CIRCUIT BREAKERS OPEN TO BILLING-CORE",
    opener: [
      "Not your on-call rotation. The SRE lead DM'd you directly.",
      '"Payments are dying. Circuit breakers between payments-api and billing-core tripped 20 min ago. No deploys. No network changes. I am out of ideas and you owe me one."',
      "2:47 AM. You pour a coffee before you even log in. This one is going to be a puzzle.",
    ],
    correct: "cert_expiry",
    backstory: "An intermediate CA that the payments-api service pinned expired at 02:30 AM. The rotation spreadsheet had the correct date, but Carla left three months ago and her calendar reminders died with her account. The JIRA epic to migrate off certificate pinning has been 'next quarter' for four quarters.",
    optimal: ["svc_logs", "deploy_check", "tls_probe", "cert_inventory", "hotfix_pinning"],
    acts: [
      {
        id: "svc_logs", cat: "investigate", icon: "search",
        label: "Tail payments-api error logs", hint: "What's the actual failure mode?",
        t: 2, f: 4,
        out: { k: "cli", lines: [
          "$ kubectl logs -n payments payments-api-7f9 | tail -40",
          "ERROR  upstream billing-core: tls: failed to verify certificate: x509: ",
          "       certificate signed by unknown authority",
          "ERROR  upstream billing-core: tls: failed to verify certificate: x509: ",
          "ERROR  upstream billing-core: circuit breaker OPEN",
          "ERROR  upstream billing-core: circuit breaker OPEN",
          "WARN   downstream request rejected: 502 Bad Gateway",
          "(constant. ~600 rps failing.)",
        ] },
        plain: "It's a TLS certificate validation failure talking to billing-core. payments-api doesn't trust billing-core's certificate anymore.",
        evid: [{ cat: "symptoms", txt: "payments-api: 'x509: certificate signed by unknown authority' when calling billing-core" }],
      },
      {
        id: "deploy_check", cat: "investigate", icon: "wrench",
        label: "Check recent deploys", hint: "Did anything ship?",
        t: 2, f: 3,
        out: { k: "cli", lines: [
          "$ deploy-log --service payments-api,billing-core --since 72h",
          "payments-api    last deploy:  2026-04-17 16:42  (healthy)",
          "billing-core    last deploy:  2026-04-15 10:20  (healthy)",
          "(no deploys in the window that matters.)",
        ] },
        plain: "Nothing shipped. Rules out a bad code deploy.",
        evid: [{ cat: "changes", txt: "No deploys to payments-api or billing-core in 48h+" }],
      },
      {
        id: "network", cat: "investigate", icon: "radio",
        label: "Check the mesh data plane", hint: "Is the network itself sick?",
        t: 3, f: 5,
        out: { k: "cli", lines: [
          "$ istioctl proxy-status | grep -E 'payments|billing'",
          "payments-api-7f9   SYNCED   SYNCED   SYNCED   SYNCED",
          "billing-core-2b1   SYNCED   SYNCED   SYNCED   SYNCED",
          "$ mesh-metrics p50/p99 payments->billing last 2h",
          "before 02:30: p99 38ms, success 99.97%",
          "after  02:30: p99 timeout, success 0.00% (TLS handshake failures)",
        ] },
        plain: "The mesh itself is healthy and the sidecars are in sync. But success rate between these two services went to zero at 02:30 AM. The break is TLS, not network.",
        evid: [{ cat: "timing", txt: "Failure rate flipped to 100% at exactly 02:30 AM" }, { cat: "symptoms", txt: "Mesh data plane healthy; failures are all TLS handshake" }],
      },
      {
        id: "tls_probe", cat: "investigate", icon: "activity",
        label: "Probe billing-core TLS from a debug pod", hint: "See what the cert actually looks like",
        t: 4, f: 6,
        out: { k: "cli", lines: [
          "$ openssl s_client -connect billing-core.payments.svc:8443 -showcerts",
          "",
          "Certificate chain:",
          "  0 s:CN=billing-core.payments.svc",
          "    i:CN=internal-issuer-intermediate-R3",
          "  1 s:CN=internal-issuer-intermediate-R3",
          "    i:CN=internal-issuer-root",
          "",
          "verify return code: 21 (unable to verify the first certificate)",
          "",
          "$ openssl x509 -in intermediate-R3.pem -noout -enddate",
          "notAfter=Apr 19 02:30:00 2026 GMT",
        ] },
        plain: "billing-core's certificate chain goes through an intermediate CA called 'internal-issuer-intermediate-R3'. That intermediate expired at 02:30 AM tonight — exactly when things broke.",
        evid: [{ cat: "changes", txt: "Intermediate CA 'internal-issuer-intermediate-R3' expired at 02:30:00 UTC tonight" }],
      },
      {
        id: "cert_inventory", cat: "investigate", icon: "search",
        label: "Check the cert rotation runbook", hint: "Who owns this?",
        t: 3, f: 5,
        out: { k: "narrative", lines: [
          "Opening cert-rotation.md (last updated 8 months ago).",
          "",
          "internal-issuer-intermediate-R3",
          "  notAfter: 2026-04-19 02:30 UTC",
          "  successor: internal-issuer-intermediate-R4",
          "  rotation owner: @carla.ng  ← (offboarded 2026-01)",
          "  calendar reminder: carla.ng@company.com (account disabled)",
          "",
          "A JIRA link: INFRA-2819 — 'Migrate services off pinned intermediate CAs' — last updated 9 months ago. Still open. Comments: 'bump next quarter.'",
        ] },
        plain: "The rotation had a named owner. She left in January. Her calendar reminders died with her account. Nobody picked up the thread. There's a migration-off-pinning ticket but it's been punted for a year.",
        evid: [{ cat: "changes", txt: "Cert rotation owner offboarded 3mo ago; calendar reminders on disabled account" }],
      },
      {
        id: "autoscaler_herring", cat: "investigate", icon: "activity",
        label: "Investigate autoscaler thrash on billing-core", hint: "Pods are churning",
        t: 4, f: 8,
        out: { k: "cli", lines: [
          "billing-core HPA events (last 30 min):",
          "  scaled 6 -> 12 (cpu target exceeded)",
          "  scaled 12 -> 18",
          "  (thrashing because new pods fail readiness)",
          "Inference: readiness failures are caused by the same TLS issue.",
          "The scaling is an effect, not a cause.",
        ] },
        plain: "The autoscaler is adding pods because existing pods look unhealthy. But the unhealthiness is because of the cert problem — adding more pods won't help. Red herring.",
        evid: [{ cat: "symptoms", txt: "HPA thrash on billing-core is downstream of the TLS failure, not a cause" }],
      },
      {
        id: "hotfix_pinning", cat: "act", icon: "lock",
        label: "Ship the pre-staged R4 intermediate bundle", hint: "There's a bundle in the repo waiting",
        t: 5, f: 10, req: ["cert_inventory"],
        out: { k: "cli", lines: [
          "$ git log --oneline -- bundles/intermediate-R4.pem",
          "(bundle was committed 4 months ago by @carla.ng, never rolled out)",
          "",
          "$ kubectl create secret generic ca-bundle --from-file=bundle.pem=bundle-R4.pem -o yaml --dry-run=client | kubectl apply -n payments -f -",
          "$ kubectl rollout restart deployment/payments-api -n payments",
          "",
          "rolling out... 3/12 ready... 8/12... 12/12",
          "mesh-metrics: success rate 0% -> 12% -> 78% -> 99.8%",
          "circuit breakers: CLOSED",
        ] },
        plain: "A pre-built R4 bundle was sitting in the repo, committed by Carla before she left. You rolled it out. Services are recovering.",
        evid: [{ cat: "symptoms", txt: "R4 intermediate bundle deployed; success rate recovering to 99.8%" }],
        restore: true,
      },
      {
        id: "bypass", cat: "act", icon: "shieldalert",
        label: "Temporarily disable TLS verification on the mesh", hint: "Unblock fast, worry about 'why' later",
        t: 3, f: 7, once: true,
        out: { k: "cli", lines: [
          "$ kubectl apply -f mesh-policy-permissive.yaml",
          "(sets peer authentication to PERMISSIVE for payments namespace)",
          "",
          "success rate climbing... 99.9%.",
          "(payments are flowing but internal PCI auditor will find this in the logs and we are going to have a meeting about it next week.)",
        ] },
        plain: "Traffic flows but you've opened a hole. For a payments service touching cardholder data. The auditor will see this.",
        cred: -25,
      },
      {
        id: "senior", cat: "escalate", icon: "userplus",
        label: "Page the infra architect", hint: "Costs credibility, buys a pointer",
        t: 8, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: [
          '"TLS handshake failures at 02:30 exactly? Ninety-nine percent that\'s a cert expiry on the minute. Check the cert chain on the dependency. If you pinned an intermediate, check when it expires. And if you pinned an intermediate, we need to talk about that later."',
        ] },
        plain: "Architect: probe the chain, suspect intermediate expiry on-the-minute, and yes — pinning was a known debt.",
      },
      {
        id: "rollback_svc", cat: "act", icon: "shieldalert",
        label: "Roll back payments-api to previous release", hint: "Classic move when you're stuck",
        t: 4, f: 7, once: true,
        out: { k: "cli", lines: [
          "$ kubectl rollout undo deployment/payments-api -n payments",
          "rolling back to rev 47 (2026-04-15)...",
          "rolled back.",
          "success rate... still 0%.",
          "(the rollback target also pins the expired intermediate. Didn't help. 4 minutes lost and circuit breakers still open.)",
        ] },
        plain: "Rolled back to an earlier version. Turns out it also pinned the same expired intermediate. No progress.",
        worse: false,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "Restore focus.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["Dark, hot, essential.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 5, line: "Stripe-facing webhook queue depth is 34,000 and climbing. Retries are backing up." },
      { at: 12, line: "CFO's EA just messaged the #payments channel. 'Is this the reason?'" },
      { at: 20, line: "PagerDuty escalation timer for incident commander fires in 2 minutes." },
    ],
    intr: [
      {
        id: "ic_page", at: 5, icon: "alert",
        title: "Incident Commander opens a bridge.",
        body: '"Status in one sentence. I\'m about to brief the CTO."',
        choices: [
          { label: "'TLS verification failure on the payments→billing hop. Investigating cert chain.'", eff: { t: 1, cred: 10 }, resp: '"That is a useful sentence. Thank you."' },
          { label: "'Investigating a payments outage. No ETA yet.'", eff: { t: 1, cred: -5 }, resp: '"I need something more specific. Try again in five."' },
          { label: "'It\'s handled. Stand by.'", eff: { t: 0, cred: -15 }, resp: "It is not handled. They will remember this." },
        ],
      },
      {
        id: "vendor", at: 14, icon: "phone",
        title: "Your payments processor's TAM calls.",
        body: '"We\'re seeing elevated failure rates on your callbacks. Are you aware?"',
        choices: [
          { label: "Confirm and share the TLS cert issue", eff: { t: 2, cred: 10 }, resp: '"OK. Appreciate the heads up. We\'ll hold retries for 20 minutes."' },
          { label: "Say it's transient and will resolve", eff: { t: 1, cred: -5 }, resp: '"...OK. We\'ll be watching." (They will.)' },
        ],
      },
    ],
    diag: [
      { id: "cert_expiry", label: "Intermediate CA expiry on pinned trust bundle (02:30 UTC)" },
      { id: "bad_deploy", label: "Recent bad deploy to payments-api or billing-core" },
      { id: "mesh_bug", label: "Service mesh (Istio) bug or misconfiguration" },
      { id: "autoscaler", label: "Autoscaler thrash exhausted billing-core capacity" },
      { id: "network_partition", label: "Network partition between namespaces" },
    ],
  },
};

// ============ ICON MAP ============
const ICONS = {
  search: Search, mail: Mail, wrench: Wrench, activity: Activity,
  radio: Radio, zap: Zap, userplus: UserPlus, shieldalert: ShieldAlert,
  coffee: Coffee, phone: Phone, alert: AlertTriangle, msg: MessageSquare,
  key: Key, globe: Globe, lock: Lock, server: Server,
};

// ============ HELPERS ============
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Focus-driven character garble for CLI output.
// Deterministic per line+focus so the display doesn't flicker.
const GLITCH = ["▓", "▒", "░", "@", "#", "%", "&", "*"];
function scrambleLine(line, focus, salt) {
  if (focus >= 30) return line;
  const rate = (30 - focus) / 200; // low focus = a few characters get garbled
  let seed = salt;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return line.split("").map((ch) => {
    if (ch === " " || ch === "\n") return ch;
    return rand() < rate ? GLITCH[Math.floor(rand() * GLITCH.length)] : ch;
  }).join("");
}

// Tiny Web Audio bleep for key feedback
function useSound() {
  const ctxRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const ensure = () => {
    if (!ctxRef.current) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) ctxRef.current = new Ctx();
      } catch { /* no audio — fine */ }
    }
    return ctxRef.current;
  };
  const beep = useCallback((freq = 520, durMs = 60, vol = 0.04) => {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000);
      o.stop(ctx.currentTime + durMs / 1000);
    } catch { /* swallow */ }
  }, [muted]);
  return { beep, muted, setMuted };
}

// Persistent best runs. localStorage works when running the app locally;
// if it's unavailable (artifact sandbox, SSR, etc.) we fall back to memory.
const STORE_KEY = "escape-outage:best-runs:v2";
function loadBestRuns() {
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}
function saveBestRuns(runs) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(runs)); } catch { /* ignore */ }
}

// ============ TYPEWRITER ============
function Typewriter({ lines, speed = 28, onDone }) {
  const [idx, setIdx] = useState(0);
  const [txt, setTxt] = useState("");

  useEffect(() => {
    if (idx >= lines.length) { onDone && onDone(); return; }
    const line = lines[idx];
    if (txt.length < line.length) {
      const to = setTimeout(() => setTxt(line.slice(0, txt.length + 1)), speed);
      return () => clearTimeout(to);
    } else {
      const to = setTimeout(() => { setIdx(idx + 1); setTxt(""); }, 650);
      return () => clearTimeout(to);
    }
  }, [idx, txt, lines, speed, onDone]);

  return (
    <div className="space-y-3 font-mono text-zinc-300">
      {lines.slice(0, idx).map((l, i) => (
        <div key={i} className="opacity-60">{l}</div>
      ))}
      {idx < lines.length && (
        <div className="text-zinc-100">
          {txt}<span className="inline-block w-2 h-4 bg-green-400 ml-0.5 animate-pulse align-middle"/>
        </div>
      )}
    </div>
  );
}

// ============ TITLE SCREEN ============
function Title({ onStart, bestRuns, onHelp, crt, setCrt, muted, setMuted }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono relative">
      <div className="max-w-3xl mx-auto pt-8 pb-16">
        <div className="flex items-start justify-between mb-2">
          <div className="text-green-400 text-xs tracking-widest">// TEXT-BASED INCIDENT RESPONSE</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMuted(m => !m)}
              title={muted ? "Unmute" : "Mute"}
              className="text-zinc-500 hover:text-zinc-200 p-1 rounded border border-zinc-800"
            >
              {muted ? <VolumeX className="w-4 h-4"/> : <Volume2 className="w-4 h-4"/>}
            </button>
            <button
              onClick={() => setCrt(c => !c)}
              title="Toggle CRT effect"
              className={`text-xs px-2 py-1 rounded border ${crt ? "border-green-500 text-green-400" : "border-zinc-800 text-zinc-500 hover:text-zinc-200"}`}
            >
              CRT
            </button>
            <button
              onClick={onHelp}
              title="Shortcuts (?)"
              className="text-zinc-500 hover:text-zinc-200 p-1 rounded border border-zinc-800"
            >
              <Keyboard className="w-4 h-4"/>
            </button>
          </div>
        </div>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-zinc-100 mb-3">ESCAPE THE OUTAGE</h1>
        <p className="text-zinc-400 text-sm mb-10">It's 2:47 AM. Something is down. You're on call.</p>

        <div className="space-y-3 mb-10">
          {Object.values(SCENARIOS).map(sc => {
            const best = bestRuns[sc.id];
            return (
              <button
                key={sc.id}
                onClick={() => onStart(sc.id)}
                className="w-full text-left bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-green-500/50 rounded-md p-5 transition group"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="text-zinc-100 text-lg font-semibold group-hover:text-green-400 transition">{sc.title}</div>
                    <div className="text-zinc-500 text-sm">{sc.tagline}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-zinc-500 uppercase tracking-wider">{sc.diff}</div>
                    <div className="text-xs text-zinc-600">{sc.sla} min SLA</div>
                  </div>
                </div>
                {best && (
                  <div className="text-xs text-amber-500/80 mt-2 pt-2 border-t border-zinc-800">
                    Best: {best.outcome} · score {best.score ?? "—"} · SLA left {best.slaLeft}m
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-zinc-600 space-y-1 leading-relaxed">
          <div>Each action costs in-game time. Watch the SLA clock.</div>
          <div>Focus drains as you work. Low focus = misread clues (literally). Coffee helps.</div>
          <div>Commit to a root cause when you think you have it. Wait too long and you breach.</div>
          <div className="text-zinc-500 pt-2">Press <kbd className="px-1 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[10px]">?</kbd> in-game for keyboard shortcuts. Hover anything marked with <HelpCircle className="inline w-3 h-3"/> for a plain-language translation.</div>
        </div>
      </div>
    </div>
  );
}

// ============ EVIDENCE BOARD ============
const EVID_CATS = [
  { key: "timing", label: "Timing", hint: "When did things start going wrong?" },
  { key: "scope", label: "Affected scope", hint: "Who's impacted and where?" },
  { key: "changes", label: "Last known changes", hint: "What changed recently?" },
  { key: "symptoms", label: "Symptoms", hint: "What are you actually seeing?" },
];

function EvidenceBoard({ evid }) {
  const total = Object.values(evid).reduce((a, b) => a + b.length, 0);
  const filledCats = EVID_CATS.filter(c => (evid[c.key] || []).length > 0).length;
  const hypothesisForming = total >= 3 && filledCats >= 2;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-green-400 tracking-widest">// EVIDENCE BOARD</div>
        <div className="text-[10px] text-zinc-600">{total} items · {filledCats}/4 cats</div>
      </div>
      <div className="space-y-3">
        {EVID_CATS.map(c => {
          const items = evid[c.key] || [];
          return (
            <div key={c.key}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{c.label}</div>
                <div className="text-xs text-zinc-600">({items.length})</div>
              </div>
              {items.length === 0 ? (
                <div className="text-xs text-zinc-600 italic pl-2">— nothing yet —</div>
              ) : (
                <ul className="space-y-1">
                  {items.map((it, i) => (
                    <li key={i} className="text-xs text-zinc-300 pl-2 border-l-2 border-green-500/40 leading-relaxed">{it}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {hypothesisForming && (
        <div className="mt-3 pt-3 border-t border-zinc-800 text-[11px] text-amber-400/90 italic leading-relaxed">
          A picture is starting to form. Cross-reference timing with the last known changes before you commit.
        </div>
      )}
    </div>
  );
}

// ============ NARRATIVE LOG ============
function LogEntry({ entry, focus, index }) {
  if (entry.k === "action") {
    return (
      <div className="border-l-2 border-green-500/60 pl-3 mb-4">
        <div className="text-xs text-green-400 mb-1">&gt; {entry.label}  <span className="text-zinc-600">[-{entry.t}m]</span></div>
      </div>
    );
  }
  if (entry.k === "cli") {
    return (
      <div className="bg-black border border-zinc-800 rounded px-3 py-2 mb-4 font-mono text-xs">
        {entry.lines.map((l, i) => (
          <div key={i} className="text-green-300 whitespace-pre-wrap leading-relaxed">
            {scrambleLine(l, focus, index * 97 + i)}
          </div>
        ))}
      </div>
    );
  }
  if (entry.k === "ticket") {
    return (
      <div className="bg-amber-950/30 border border-amber-900/50 rounded px-3 py-2 mb-4 font-mono text-xs">
        {entry.lines.map((l, i) => (
          <div key={i} className="text-amber-200 whitespace-pre-wrap leading-relaxed">{l}</div>
        ))}
      </div>
    );
  }
  if (entry.k === "narrative") {
    return (
      <div className="mb-4 text-sm text-zinc-300 leading-relaxed">
        {entry.lines.map((l, i) => (
          <div key={i} className={l === "" ? "h-2" : ""}>{l}</div>
        ))}
      </div>
    );
  }
  if (entry.k === "plain") {
    return (
      <div className="mb-4 bg-blue-950/30 border border-blue-900/40 rounded px-3 py-2 flex gap-2 items-start">
        <HelpCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5"/>
        <div className="text-xs text-blue-200 leading-relaxed italic">{entry.text}</div>
      </div>
    );
  }
  if (entry.k === "system") {
    return <div className="text-xs text-zinc-500 italic mb-3 font-mono">// {entry.text}</div>;
  }
  if (entry.k === "ambient") {
    return (
      <div className="mb-3 text-xs text-zinc-500 font-mono pl-3 border-l border-zinc-800 italic leading-relaxed">
        {entry.text}
      </div>
    );
  }
  if (entry.k === "danger") {
    return (
      <div className="mb-4 bg-red-950/40 border border-red-900/60 rounded px-3 py-2">
        <div className="text-xs text-red-300 font-semibold">{entry.text}</div>
      </div>
    );
  }
  return null;
}

// ============ INTERRUPT MODAL ============
function Interrupt({ intr, onChoose }) {
  const Icon = ICONS[intr.icon] || Phone;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-amber-600/60 rounded-md max-w-lg w-full p-5 shadow-2xl shadow-amber-900/40">
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-5 h-5 text-amber-400 animate-pulse"/>
          <div className="text-xs text-amber-400 tracking-widest uppercase">Incoming</div>
        </div>
        <div className="text-lg font-semibold text-zinc-100 mb-2">{intr.title}</div>
        <div className="text-sm text-zinc-300 italic mb-5 leading-relaxed">{intr.body}</div>
        <div className="space-y-2">
          {intr.choices.map((c, i) => (
            <button
              key={i}
              onClick={() => onChoose(c)}
              className="w-full text-left bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-amber-600/60 rounded px-3 py-2.5 transition text-sm text-zinc-200"
            >
              <div className="flex items-center justify-between gap-2">
                <span>{c.label}</span>
                <ChevronRight className="w-4 h-4 text-zinc-500"/>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ DIAGNOSIS MODAL ============
function Diagnose({ sc, onCommit, onCancel, evidCount }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-green-600/50 rounded-md max-w-xl w-full p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-green-400 tracking-widest uppercase">// Commit Root Cause</div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4"/></button>
        </div>
        <div className="text-sm text-zinc-400 mb-4 leading-relaxed">
          You're about to commit to a diagnosis. This ends your investigation.
          {evidCount < 4 && <div className="text-amber-400 text-xs mt-2">⚠ Only {evidCount} pieces of evidence gathered — committing early is risky.</div>}
        </div>
        <div className="space-y-2 mb-5">
          {sc.diag.map(d => (
            <button
              key={d.id}
              onClick={() => setSel(d.id)}
              className={`w-full text-left rounded px-3 py-2.5 transition text-sm border ${sel === d.id ? "bg-green-900/40 border-green-500 text-zinc-100" : "bg-zinc-800 border-zinc-700 hover:border-zinc-600 text-zinc-300"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-2">Keep investigating</button>
          <button
            onClick={() => sel && onCommit(sel)}
            disabled={!sel}
            className="bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-semibold text-sm px-4 py-2 rounded transition"
          >
            Commit diagnosis
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ HELP / SHORTCUTS OVERLAY ============
function HelpOverlay({ onClose }) {
  const rows = [
    ["1 – 9", "Trigger corresponding available action"],
    ["D", "Open Commit Diagnosis dialog"],
    ["C", "Pour a coffee (if available)"],
    ["M", "Mute / unmute sound"],
    ["?", "Toggle this help"],
    ["Esc", "Close dialogs"],
  ];
  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-zinc-900 border border-zinc-700 rounded-md max-w-md w-full p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs text-green-400 tracking-widest">// KEYBOARD</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4"/></button>
        </div>
        <div className="space-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <kbd className="px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] font-mono text-zinc-300">{k}</kbd>
              <div className="text-zinc-400 text-xs ml-4 text-right flex-1">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-zinc-800 text-[11px] text-zinc-500 italic leading-relaxed">
          Actions are numbered in the order they appear. When actions unlock or disappear, the numbers shift — look before you press.
        </div>
      </div>
    </div>
  );
}

// ============ GAME SCREEN ============
function Game({ scKey, onEnd, sound, crt }) {
  const sc = SCENARIOS[scKey];
  const [log, setLog] = useState([]);
  const [evid, setEvid] = useState({ timing: [], scope: [], changes: [], symptoms: [] });
  const [sla, setSla] = useState(sc.sla);
  const [focus, setFocus] = useState(100);
  const [cred, setCred] = useState(100);
  const [elapsed, setElapsed] = useState(0);
  const [doneActs, setDoneActs] = useState(new Set());
  const [doneIntrs, setDoneIntrs] = useState(new Set());
  const [doneAmbient, setDoneAmbient] = useState(new Set());
  const [curIntr, setCurIntr] = useState(null);
  const [showDiag, setShowDiag] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [openerDone, setOpenerDone] = useState(false);
  const [worseTriggered, setWorseTriggered] = useState(false);
  const [restored, setRestored] = useState(false);
  const endedRef = useRef(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  useEffect(() => {
    if (openerDone && log.length === 0) {
      setLog([
        { k: "danger", text: sc.alert },
        { k: "system", text: "incident log started — your move" },
      ]);
    }
  }, [openerDone, log, sc]);

  const addLog = (entries) => setLog(l => [...l, ...entries]);

  const checkInterrupt = (newElapsed) => {
    for (const intr of sc.intr) {
      if (!doneIntrs.has(intr.id) && newElapsed >= intr.at) {
        setCurIntr(intr);
        setDoneIntrs(s => new Set([...s, intr.id]));
        sound.beep(740, 90, 0.06);
        return;
      }
    }
  };

  const checkAmbient = (newElapsed) => {
    if (!sc.ambient) return;
    const fired = [];
    for (const ev of sc.ambient) {
      const id = `${ev.at}|${ev.line}`;
      if (!doneAmbient.has(id) && newElapsed >= ev.at) {
        fired.push(ev);
      }
    }
    if (fired.length > 0) {
      addLog(fired.map(ev => ({ k: "ambient", text: ev.line })));
      setDoneAmbient(s => {
        const n = new Set(s);
        for (const ev of fired) n.add(`${ev.at}|${ev.line}`);
        return n;
      });
    }
  };

  const doAction = (a) => {
    if (doneActs.has(a.id) && a.once) return;
    if (a.req && !a.req.every(r => doneActs.has(r))) return;

    // Focus penalty: under 30, each action takes 1 extra minute
    const focusPenalty = focus < 30 ? 1 : 0;
    const tCost = a.t + focusPenalty;

    const entries = [{ k: "action", label: a.label, t: tCost }];
    if (focusPenalty > 0) {
      entries.push({ k: "system", text: "low focus — that took a minute longer than it should have" });
    }
    if (a.out) entries.push(a.out);
    if (a.plain) entries.push({ k: "plain", text: a.plain });

    if (a.evid) {
      setEvid(e => {
        const next = { ...e };
        for (const ev of a.evid) {
          if (!next[ev.cat].includes(ev.txt)) next[ev.cat] = [...next[ev.cat], ev.txt];
        }
        return next;
      });
    }

    if (a.worse) {
      setWorseTriggered(true);
      entries.push({ k: "danger", text: "⚠ SECONDARY IMPACT TRIGGERED — you just made it worse" });
      sound.beep(180, 260, 0.08);
    } else if (a.restore) {
      setRestored(true);
      entries.push({ k: "system", text: "service partially restored by your action" });
      sound.beep(880, 120, 0.06);
    } else {
      sound.beep(520, 40, 0.035);
    }

    addLog(entries);
    setDoneActs(s => new Set([...s, a.id]));
    setSla(s => s - tCost);
    const newFocus = clamp(focus - a.f, 0, 100);
    setFocus(newFocus);
    if (a.cred) setCred(c => clamp(c + a.cred, 0, 100));

    const newElapsed = elapsed + tCost;
    setElapsed(newElapsed);
    checkAmbient(newElapsed);
    checkInterrupt(newElapsed);
  };

  const handleIntrChoice = (c) => {
    const dt = c.eff.t || 0;
    setSla(s => s - dt);
    if (c.eff.cred) setCred(cr => clamp(cr + c.eff.cred, 0, 100));
    addLog([{ k: "narrative", lines: [`[interrupt] ${curIntr.title}`, c.resp] }]);
    setCurIntr(null);
    const newElapsed = elapsed + dt;
    setElapsed(newElapsed);
    checkAmbient(newElapsed);
  };

  const commit = (diagId) => {
    if (endedRef.current) return;
    endedRef.current = true;
    setShowDiag(false);
    const correct = diagId === sc.correct;
    const slaLeft = sla;
    let outcome;
    if (worseTriggered) outcome = "worse";
    else if (correct && slaLeft > 5 && cred > 60) outcome = "clean";
    else if (correct && slaLeft >= 0) outcome = "squeaker";
    else if (!correct && restored) outcome = "wrong_fix";
    else if (slaLeft < 0) outcome = "breach";
    else outcome = "wrong";

    const evidCount = Object.values(evid).flat().length;
    const optimalHit = (sc.optimal || []).filter(id => doneActs.has(id)).length;
    const optimalTotal = (sc.optimal || []).length || 1;

    // Scoring: correctness 40, SLA cushion 25, credibility 15, evidence 10, optimal path 10, minus worse penalty
    const correctnessPts = correct ? 40 : (restored ? 10 : 0);
    const slaPts = slaLeft > 0 ? Math.min(25, Math.round((slaLeft / sc.sla) * 25)) : 0;
    const credPts = Math.round((cred / 100) * 15);
    const evidPts = Math.min(10, evidCount * 2);
    const pathPts = Math.round((optimalHit / optimalTotal) * 10);
    const worsePenalty = worseTriggered ? 40 : 0;
    const score = Math.max(0, correctnessPts + slaPts + credPts + evidPts + pathPts - worsePenalty);

    // Achievements
    const achievements = [];
    if (correct && !doneActs.has("escalate") && !doneActs.has("senior")) achievements.push(["Cold Start", "Solved it without calling a senior."]);
    if (correct && slaLeft >= Math.round(sc.sla * 0.5)) achievements.push(["Half-Clock", "Committed with half the SLA still in the tank."]);
    if (correct && evidCount >= 6) achievements.push(["Paper Trail", "Gathered the full case before committing."]);
    if (correct && !worseTriggered && !doneActs.has("cowboy")) achievements.push(["No Cowboy", "Correct diagnosis, no reckless commits."]);
    if (correct && cred >= 90) achievements.push(["Composed", "Kept credibility above 90 end to end."]);

    onEnd({
      outcome, scKey, diagId, correct, slaLeft, cred, focus,
      evidCount, score, achievements, optimalHit, optimalTotal,
      doneActIds: [...doneActs],
    });
  };

  // SLA breach check — guarded against double-fire
  useEffect(() => {
    if (endedRef.current) return;
    if (sla <= -5 && openerDone && !curIntr) {
      endedRef.current = true;
      const evidCount = Object.values(evid).flat().length;
      const optimalHit = (sc.optimal || []).filter(id => doneActs.has(id)).length;
      const optimalTotal = (sc.optimal || []).length || 1;
      const score = Math.max(0, Math.round((cred / 100) * 15) + Math.min(10, evidCount * 2));
      onEnd({
        outcome: "breach", scKey, diagId: null, correct: false,
        slaLeft: sla, cred, focus, evidCount, score,
        achievements: [], optimalHit, optimalTotal,
        doneActIds: [...doneActs],
      });
    }
  }, [sla, curIntr, openerDone, scKey, cred, focus, evid, doneActs, onEnd, sc.optimal]);

  // Available actions in a stable order
  const avail = useMemo(() => sc.acts.filter(a => {
    if (a.once && doneActs.has(a.id)) return false;
    if (a.req && !a.req.every(r => doneActs.has(r))) return false;
    return true;
  }), [sc.acts, doneActs]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (curIntr || showDiag) {
        if (e.key === "Escape") {
          if (showDiag) setShowDiag(false);
        }
        return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowHelp(h => !h);
        return;
      }
      if (showHelp) {
        if (e.key === "Escape") setShowHelp(false);
        return;
      }
      if (e.key === "Escape") return;
      if (e.key === "d" || e.key === "D") { e.preventDefault(); setShowDiag(true); return; }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); sound.setMuted(m => !m); return; }
      if (e.key === "c" || e.key === "C") {
        const coffee = avail.find(a => a.id === "coffee");
        if (coffee) { e.preventDefault(); doAction(coffee); }
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= 9) {
        const a = avail[n - 1];
        if (a) { e.preventDefault(); doAction(a); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail, curIntr, showDiag, showHelp]);

  if (!openerDone) {
    return (
      <div className={`min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono flex items-center ${crt ? "crt" : ""}`}>
        <div className="max-w-2xl mx-auto w-full">
          <div className="text-xs text-red-400 tracking-widest mb-4 animate-pulse">// INCOMING PAGE</div>
          <Typewriter lines={sc.opener} onDone={() => setTimeout(() => setOpenerDone(true), 800)}/>
        </div>
      </div>
    );
  }

  const cats = {
    investigate: { label: "Investigate", color: "text-green-400", border: "border-green-500/40" },
    act: { label: "Take action", color: "text-amber-400", border: "border-amber-500/40" },
    escalate: { label: "Escalate / call for help", color: "text-purple-400", border: "border-purple-500/40" },
  };

  // Compute stable hotkey numbers across all categories
  const ordered = ["investigate", "act", "escalate"].flatMap(k => avail.filter(a => a.cat === k));
  const hotkeyFor = (id) => {
    const idx = ordered.findIndex(a => a.id === id);
    return idx >= 0 && idx < 9 ? String(idx + 1) : null;
  };

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 font-mono ${crt ? "crt" : ""}`}>
      {curIntr && <Interrupt intr={curIntr} onChoose={handleIntrChoice}/>}
      {showDiag && <Diagnose sc={sc} onCommit={commit} onCancel={() => setShowDiag(false)} evidCount={Object.values(evid).flat().length}/>}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)}/>}

      {/* Status bar */}
      <div className="sticky top-0 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="text-xs text-zinc-500 mr-2">{sc.title}</div>

          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${sla < 5 ? "text-red-400 animate-pulse" : sla < 10 ? "text-amber-400" : "text-zinc-400"}`}/>
            <div className="text-xs">
              <div className="text-zinc-500 uppercase tracking-wider text-[10px]">SLA</div>
              <div className={`font-mono font-semibold ${sla < 5 ? "text-red-400" : sla < 10 ? "text-amber-400" : "text-zinc-200"}`}>
                {sla < 0 ? `-${Math.abs(sla)}m BREACH` : `${sla}m`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Brain className={`w-4 h-4 ${focus < 30 ? "text-red-400" : "text-zinc-400"}`}/>
            <div className="flex-1 min-w-[80px]">
              <div className="text-zinc-500 uppercase tracking-wider text-[10px]">Focus</div>
              <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full transition-all ${focus < 30 ? "bg-red-500" : focus < 60 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${focus}%` }}/>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Users className={`w-4 h-4 ${cred < 50 ? "text-red-400" : "text-zinc-400"}`}/>
            <div className="flex-1 min-w-[80px]">
              <div className="text-zinc-500 uppercase tracking-wider text-[10px]">Credibility</div>
              <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full transition-all ${cred < 50 ? "bg-red-500" : cred < 75 ? "bg-amber-500" : "bg-blue-400"}`} style={{ width: `${cred}%` }}/>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => sound.setMuted(m => !m)}
              className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded border border-zinc-800"
              title="Mute (M)"
            >
              {sound.muted ? <VolumeX className="w-3.5 h-3.5"/> : <Volume2 className="w-3.5 h-3.5"/>}
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded border border-zinc-800"
              title="Shortcuts (?)"
            >
              <Keyboard className="w-3.5 h-3.5"/>
            </button>
            <button
              onClick={() => setShowDiag(true)}
              className="bg-green-600 hover:bg-green-500 text-black font-semibold text-xs px-3 py-1.5 rounded transition flex items-center gap-1.5"
              title="Commit diagnosis (D)"
            >
              Commit diagnosis <kbd className="text-[10px] opacity-80">D</kbd>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 grid md:grid-cols-[1fr_320px] gap-6">
        {/* Narrative + actions */}
        <div className="space-y-4 min-w-0">
          <div ref={logRef} className="bg-zinc-900 border border-zinc-800 rounded-md p-4 max-h-[500px] overflow-y-auto">
            {log.map((e, i) => <LogEntry key={i} entry={e} focus={focus} index={i}/>)}
          </div>

          <div className="space-y-3">
            <div className="text-xs text-green-400 tracking-widest">// AVAILABLE ACTIONS <span className="text-zinc-600 normal-case tracking-normal">— press 1-9 to select</span></div>
            {["investigate", "act", "escalate"].map(catKey => {
              const items = avail.filter(a => a.cat === catKey);
              if (items.length === 0) return null;
              const c = cats[catKey];
              return (
                <div key={catKey}>
                  <div className={`text-xs ${c.color} uppercase tracking-wider mb-2`}>{c.label}</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {items.map(a => {
                      const Icon = ICONS[a.icon] || Terminal;
                      const hk = hotkeyFor(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => doAction(a)}
                          className={`text-left bg-zinc-900 hover:bg-zinc-800 border ${c.border} hover:border-opacity-80 rounded p-3 transition group`}
                        >
                          <div className="flex items-start gap-2.5">
                            <Icon className={`w-4 h-4 ${c.color} flex-shrink-0 mt-0.5`}/>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm text-zinc-200 font-medium leading-tight">{a.label}</div>
                                {hk && <kbd className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 font-mono flex-shrink-0">{hk}</kbd>}
                              </div>
                              {a.hint && <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{a.hint}</div>}
                              <div className="text-[10px] text-zinc-600 mt-1.5 font-mono">
                                {a.t > 0 && `-${a.t}m time`}
                                {a.f > 0 && ` · -${a.f}% focus`}
                                {a.f < 0 && ` · +${-a.f}% focus`}
                                {a.cred && ` · ${a.cred > 0 ? "+" : ""}${a.cred} cred`}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Evidence board */}
        <div className="md:sticky md:top-[74px] md:self-start">
          <EvidenceBoard evid={evid}/>
          <div className="text-[10px] text-zinc-600 mt-3 italic leading-relaxed">
            Evidence fills in as you investigate. Use it to narrow down the root cause before you commit.
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ ENDING SCREEN ============
const ENDINGS = {
  clean: {
    title: "CLEAN KILL",
    color: "text-green-400",
    border: "border-green-500/60",
    bg: "bg-green-950/20",
    tag: "Nobody ever knows.",
  },
  squeaker: {
    title: "SQUEAKER",
    color: "text-amber-400",
    border: "border-amber-500/60",
    bg: "bg-amber-950/20",
    tag: "Right call. Barely.",
  },
  wrong_fix: {
    title: "WRONG DIAGNOSIS, RIGHT FIX",
    color: "text-purple-400",
    border: "border-purple-500/60",
    bg: "bg-purple-950/20",
    tag: "It worked. You'll never know why.",
  },
  wrong: {
    title: "WRONG CALL",
    color: "text-red-400",
    border: "border-red-500/60",
    bg: "bg-red-950/20",
    tag: "The morning standup is going to be grim.",
  },
  breach: {
    title: "SLA BREACH",
    color: "text-red-400",
    border: "border-red-500/60",
    bg: "bg-red-950/20",
    tag: "You ran out of time.",
  },
  worse: {
    title: "YOU MADE IT WORSE",
    color: "text-red-500",
    border: "border-red-600/60",
    bg: "bg-red-950/30",
    tag: "Your fix caused a second outage. Post-mortem is going to be a reading.",
  },
};

function Ending({ result, onRestart, onTitle, crt }) {
  const sc = SCENARIOS[result.scKey];
  const end = ENDINGS[result.outcome];
  const correctDiag = sc.diag.find(d => d.id === sc.correct);
  const yourDiag = sc.diag.find(d => d.id === result.diagId);

  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono ${crt ? "crt" : ""}`}>
      <div className="max-w-3xl mx-auto pt-8">
        <div className={`${end.bg} ${end.border} border rounded-md p-6 mb-6`}>
          <div className={`text-xs ${end.color} tracking-widest uppercase mb-2`}>// INCIDENT CLOSED</div>
          <div className="flex items-end gap-4 flex-wrap">
            <h1 className={`text-4xl font-bold ${end.color}`}>{end.title}</h1>
            <div className="text-sm text-zinc-500 ml-auto">
              <div className="uppercase tracking-widest text-[10px]">Score</div>
              <div className={`text-3xl font-mono ${end.color}`}>{result.score ?? 0}</div>
            </div>
          </div>
          <div className="text-zinc-300 italic mt-2">{end.tag}</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-5 mb-4 space-y-4">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Scenario</div>
            <div className="text-zinc-200">{sc.title} <span className="text-zinc-500">· {sc.diff} · {sc.sla}m SLA</span></div>
          </div>

          {yourDiag && (
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Your diagnosis</div>
              <div className={result.correct ? "text-green-400" : "text-red-400"}>{yourDiag.label}</div>
            </div>
          )}

          {!result.correct && (
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Actual root cause</div>
              <div className="text-green-400">{correctDiag.label}</div>
            </div>
          )}

          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">The full story</div>
            <div className="text-sm text-zinc-300 leading-relaxed italic">{sc.backstory}</div>
          </div>

          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-zinc-800">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">SLA remaining</div>
              <div className={`text-lg font-semibold ${result.slaLeft < 0 ? "text-red-400" : "text-zinc-200"}`}>{result.slaLeft}m</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Credibility</div>
              <div className="text-lg font-semibold text-zinc-200">{result.cred}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Evidence</div>
              <div className="text-lg font-semibold text-zinc-200">{result.evidCount}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Optimal path</div>
              <div className="text-lg font-semibold text-zinc-200">{result.optimalHit}/{result.optimalTotal}</div>
            </div>
          </div>
        </div>

        {result.achievements && result.achievements.length > 0 && (
          <div className="bg-zinc-900 border border-amber-800/60 rounded-md p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-amber-400"/>
              <div className="text-xs text-amber-400 tracking-widest uppercase">// Achievements</div>
            </div>
            <div className="space-y-2">
              {result.achievements.map(([name, desc], i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="text-amber-300 font-semibold text-sm flex-shrink-0 w-24">{name}</div>
                  <div className="text-zinc-400 text-sm">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-blue-400"/>
            <div className="text-xs text-blue-400 tracking-widest uppercase">// Suggested path</div>
          </div>
          <div className="text-xs text-zinc-500 mb-2 italic">The shortest evidence chain to this root cause (✓ = actions you took):</div>
          <ol className="list-decimal list-inside space-y-1 text-sm text-zinc-300">
            {(sc.optimal || []).map(id => {
              const a = sc.acts.find(x => x.id === id);
              const hit = (result.doneActIds || []).includes(id);
              return (
                <li key={id} className={hit ? "text-green-400" : "text-zinc-500"}>
                  {hit ? "✓ " : "· "}{a ? a.label : id}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex gap-3">
          <button onClick={onRestart} className="flex-1 bg-green-600 hover:bg-green-500 text-black font-semibold px-4 py-3 rounded transition flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4"/> Run it back
          </button>
          <button onClick={onTitle} className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 px-4 py-3 rounded transition flex items-center justify-center gap-2">
            <Play className="w-4 h-4"/> Pick a scenario
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ ROOT ============
export default function App() {
  const [screen, setScreen] = useState("title");
  const [scKey, setScKey] = useState(null);
  const [result, setResult] = useState(null);
  const [bestRuns, setBestRuns] = useState(() => loadBestRuns());
  const [showHelpOnTitle, setShowHelpOnTitle] = useState(false);
  const [crt, setCrt] = useState(false);
  const sound = useSound();

  const saveBest = useCallback((res) => {
    const current = bestRuns[res.scKey];
    const isBetter = !current ||
      (res.outcome === "clean" && current.outcome !== "clean") ||
      (res.outcome === current.outcome && (res.score ?? 0) > (current.score ?? 0));
    if (isBetter) {
      const next = { ...bestRuns, [res.scKey]: res };
      setBestRuns(next);
      saveBestRuns(next);
    }
  }, [bestRuns]);

  const start = (key) => { setScKey(key); setScreen("game"); };
  const end = useCallback((res) => { setResult(res); setScreen("ending"); saveBest(res); }, [saveBest]);
  const restart = () => { setResult(null); setScreen("game"); };
  const title = () => { setResult(null); setScKey(null); setScreen("title"); };

  return (
    <>
      <style>{`
        .crt::before {
          content: '';
          position: fixed; inset: 0; pointer-events: none; z-index: 40;
          background: repeating-linear-gradient(
            to bottom,
            rgba(0,255,120,0.025) 0px,
            rgba(0,255,120,0.025) 1px,
            transparent 1px,
            transparent 3px
          );
          mix-blend-mode: overlay;
        }
        .crt::after {
          content: '';
          position: fixed; inset: 0; pointer-events: none; z-index: 41;
          box-shadow: inset 0 0 180px rgba(0,0,0,0.55);
        }
        kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      `}</style>
      {screen === "title" && (
        <Title
          onStart={start}
          bestRuns={bestRuns}
          onHelp={() => setShowHelpOnTitle(true)}
          crt={crt} setCrt={setCrt}
          muted={sound.muted} setMuted={sound.setMuted}
        />
      )}
      {screen === "game" && <Game scKey={scKey} onEnd={end} sound={sound} crt={crt}/>}
      {screen === "ending" && <Ending result={result} onRestart={restart} onTitle={title} crt={crt}/>}
      {showHelpOnTitle && <HelpOverlay onClose={() => setShowHelpOnTitle(false)}/>}
    </>
  );
}

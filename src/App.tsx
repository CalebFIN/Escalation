import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Clock, Brain, Users, AlertTriangle, Phone, MessageSquare, Mail, Activity,
  HelpCircle, Play, RotateCcw, ChevronRight, X, Terminal, Search, Radio,
  Wrench, ShieldAlert, Coffee, UserPlus, Zap, Volume2, VolumeX, Keyboard,
  Key, Globe, Trophy, BookOpen, Lock, Server, Copy, Check,
} from "lucide-react";

/* ============================================================================
   ESCAPE THE OUTAGE — text-based incident response
   ============================================================================
   Four scenarios. Investigate, commit a root cause, survive the SLA.
   Details are mostly real — but leaned toward "readable for anyone" over
   "passes an SRE interview."  Also: Kevin.
   ========================================================================== */

// ============ SCENARIO DATA ============

const SCENARIOS = {
  fiber: {
    id: "fiber",
    title: "The Midnight Cut",
    tagline: "A backhoe vs. your fiber. The backhoe won.",
    diff: "Moderate",
    sla: 30,
    alert: "MULTI-CIRCUIT OUTAGE · EAST METRO · 23 CUSTOMERS DOWN",
    opener: [
      "Your phone is vibrating itself off the nightstand.",
      "2:47 AM. Blue light on the ceiling. PagerDuty.",
      "You fumble for the laptop, step on a Lego, and decide not to scream.",
      "Twenty-three customers are down. Something, somewhere, is very unhappy.",
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
        out: { k: "narrative", lines: ["Hot water, grounds, inhale. The fog lifts a little.", "Somewhere, a customer is typing 'is it back yet'. They have typed this eleven times.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 4, line: "A dad just called in because his Ring doorbell is 'recording but not streaming.' He is watching a raccoon." },
      { at: 6, line: "Tier 1: '12 tickets now. Meridian's CIO is on hold.'" },
      { at: 10, line: "A 14-year-old called in. He is the only person on his Apex squad with a working connection. He considers this 'a loss'." },
      { at: 12, line: "Slack #incidents has 19 people in it. Someone is asking about the runbook. Nobody has read the runbook." },
      { at: 16, line: "A wedding photographer is trying to upload 4,800 RAW files 'by sunrise.' The wedding was in March." },
      { at: 20, line: "Twitter: @meridian_health retweeted 'is your internet working?' Tier 1 is screenshotting." },
      { at: 26, line: "The mayor's aide is 'just checking in' via email. The email has 11 exclamation points." },
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
      {
        id: "small_biz", at: 14, icon: "phone",
        title: "Small-business owner. Call escalated to you.",
        body: '"Listen — you people. My POS system is down. My POS system. I have an EMPANADA TRUCK. Do you understand what that MEANS. The people want empanadas AT 3 AM and I CAN\'T CHARGE THEM."',
        choices: [
          { label: "'Ma\\'am, take cash. We\\'re on it — fiber\\'s cut.'", eff: { t: 1, cred: 5 }, resp: "'Cash. CASH. It\\'s 2026. Who carries CASH.' (you do not have a good answer for this.)" },
          { label: "Offer her a future service credit.", eff: { t: 2, cred: 5 }, resp: "'Fine. ONE free month. And I want it in EMPANADAS equivalent. You do the math.'" },
          { label: "'We\\'re working on it, ma\\'am.'", eff: { t: 0, cred: -5 }, resp: "Four more ticket escalations from her arrive in the next two minutes. All in caps." },
        ],
      },
      {
        id: "local_news", at: 24, icon: "alert",
        title: "PR is slacking you.",
        body: '"Channel 7 just called. They want a comment on the \'mass internet outage.\' It\'s 23 customers. Someone\'s cousin works there. Please give me ONE sentence I can give them."',
        choices: [
          { label: "'Fiber cut from nearby construction. Restoration in progress.'", eff: { t: 1, cred: 10 }, resp: "PR: 'Perfect. Boring. Love it. Going with that.'" },
          { label: "'We are aware of the issue.'", eff: { t: 0, cred: 0 }, resp: "PR: 'That\\'s seven words of nothing. They\\'re going to imply we\\'re hiding something.'" },
          { label: "'Tell them to call the backhoe.'", eff: { t: 0, cred: -10 }, resp: "PR, sighing: 'I cannot say that on air. But I love you for it.' They say it on air." },
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
    title: "The Silent Partner",
    tagline: "Upstream carrier is quietly breaking our internet",
    diff: "Hard",
    sla: 25,
    alert: "UPSTREAM UPLINK FLAPPING · INTERMITTENT IMPACT · 847 CUSTOMERS",
    opener: [
      "Phone. Then Slack. Then a text. Then another text.",
      "2:47 AM. Your Tier 1 has been watching this one for fifteen minutes and is fresh out of patience.",
      '"Hey. It\'s weird. Things are mostly working. Except when they\'re not. Every few minutes. Can you look?"',
      "Intermittent. The worst kind.",
    ],
    correct: "upstream_maint",
    backstory: "An engineer at your upstream carrier did an unannounced hardware swap at 02:29. The maintenance notification was written. It was supposed to go out. It's still sitting in a draft folder on someone's laptop, at home, next to a very cold cup of tea.",
    optimal: ["uplink", "our_changes", "tickets", "call_upstream", "reroute"],
    acts: [
      {
        id: "uplink", cat: "investigate", icon: "search",
        label: "Check our uplink to the upstream carrier", hint: "Is our connection to them stable?",
        t: 2, f: 4,
        out: { k: "cli", lines: ["$ show uplink carrier-A | match state|flaps", "state: recovering  (was down)", "  flaps in last hour: 8", "  last down: 02:44  (timeout)", "  last up:   02:41", "  pattern: up ~4 min, down ~45s"] },
        plain: "Our connection to the upstream carrier keeps dying and coming back — roughly every five minutes. Started at 02:29. That's sixteen minutes before anyone paged us.",
        evid: [{ cat: "timing", txt: "Carrier uplink started flapping at 02:29 — before anyone paged us" }, { cat: "symptoms", txt: "Cycling: ~4 min up, ~45s down — textbook flap" }],
      },
      {
        id: "tickets", cat: "investigate", icon: "mail",
        label: "Scan customer tickets", hint: "What are customers actually seeing?",
        t: 1, f: 2,
        out: { k: "ticket", lines: ["18 tickets in 25 min:", "  • Intermittent slowness (9)", "  • Connection drops mid-task (6)", "  • Video calls freezing (3)", "Nobody reports 'totally down.' Just... annoying."] },
        plain: "No one's fully down — everyone's getting intermittent pain. That matches a flapping uplink, not a hard break.",
        evid: [{ cat: "scope", txt: "847 customers, intermittent (nothing fully down)" }],
      },
      {
        id: "carrier_portal", cat: "investigate", icon: "search",
        label: "Check the carrier's status page", hint: "Have they posted anything?",
        t: 4, f: 6,
        out: { k: "narrative", lines: ["Password manager... two-factor... loading status page...", "", "Network Status: ✓ All Systems Operational", "Last posted advisory: 3 days ago", "", "(nothing posted for tonight. Suspicious.)"] },
        plain: "Their public status page says everything's fine. It is, famously, never updated in real time.",
        evid: [{ cat: "changes", txt: "Carrier status page says 'all green' — but those pages always lag reality" }],
      },
      {
        id: "email", cat: "investigate", icon: "mail",
        label: "Search inbox for maintenance notices", hint: "Did we get an email and miss it?",
        t: 3, f: 5,
        out: { k: "narrative", lines: ['Searching: from:(@carrier-A) subject:(maintenance OR change)', "", "Most recent: 11 days ago (routine, completed).", "Nothing scheduled for this week.", "", "(they sometimes send urgent ones from a different address, though.)"] },
        plain: "No maintenance notice in your inbox. But they sometimes use a weird address for emergencies, so 'no email' isn't definitive.",
        evid: [{ cat: "changes", txt: "No maintenance email in 11 days" }],
      },
      {
        id: "our_changes", cat: "investigate", icon: "wrench",
        label: "Check our own recent changes", hint: "Are we sure this isn't us?",
        t: 3, f: 5,
        out: { k: "cli", lines: ["$ change-log --uplink carrier-A --since 14d", "(no changes to this uplink in 14 days)", "$ change-log --edge-routers --since 48h", "(nothing in 48h)"] },
        plain: "We haven't touched anything that could cause this. It's not us.",
        evid: [{ cat: "changes", txt: "No changes on our side in 14 days — not a self-inflicted wound" }],
      },
      {
        id: "ddos", cat: "investigate", icon: "shieldalert",
        label: "Look for a DDoS signature", hint: "Could it be an attack?",
        t: 4, f: 8,
        out: { k: "cli", lines: ["$ traffic-analyzer --uplink carrier-A --last 30m", "spiky traffic during 'up' windows — but no single source", "no common attack signatures", "Inference: the traffic bursts are queued-up traffic rushing through", "when the connection recovers. A symptom, not an attack."] },
        plain: "The traffic looks spiky, but in a normal way — it's traffic that piled up during 'down' windows bursting through when things recover. Not an attack. Red herring.",
        evid: [{ cat: "symptoms", txt: "Traffic bursts are queue recovery, not attack signature" }],
      },
      {
        id: "call_upstream", cat: "escalate", icon: "phone",
        label: "Call the carrier's NOC directly", hint: "Talk to a human on their side",
        t: 6, f: 6,
        out: { k: "narrative", lines: ['Four minutes of hold music. Then:', '', '"Yeah, hold on — yeah, we\'ve got a line card swap on the edge facing you. Started 02:29. Should\'ve been seamless. Backup card is doing something weird. We\'re seeing flaps our side too."', '', '"Did you get our notification?"', '"...no."', '"Huh. Let me check. ...oh. Oh, it\'s sitting in someone\'s drafts folder. I am so sorry."'] },
        plain: "The carrier confirms: they're doing unannounced hardware work. Their notification email was never actually sent. It is, famously, still in someone's drafts.",
        evid: [{ cat: "changes", txt: "Carrier admits unannounced hardware swap at 02:29" }],
      },
      {
        id: "reroute", cat: "act", icon: "zap",
        label: "Shift traffic to the backup carrier", hint: "Route around the flapping uplink",
        t: 5, f: 10,
        out: { k: "cli", lines: ["$ configure", "$ set policy carrier-A weight -100", "$ set policy carrier-B weight +100", "$ commit", "traffic shifting... 92% of flows now via carrier-B", "customer impact: resolving"] },
        plain: "Pushed traffic to the backup carrier. Customers stabilizing.",
        evid: [{ cat: "symptoms", txt: "Traffic shifted to backup carrier — customers recovering" }],
        restore: true,
      },
      {
        id: "escalate", cat: "escalate", icon: "userplus",
        label: "Call the senior engineer", hint: "Costs credibility, buys a hint",
        t: 10, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: ['Senior eng, sleepy: "Flapping uplink, intermittent pain, nothing changed our side? Nine times in ten that\'s the carrier. Call them. And if their portal is green, do not trust it — that thing lags reality by an hour."'] },
        plain: "Senior engineer: call the carrier. Don't trust their status page.",
      },
      {
        id: "cowboy", cat: "act", icon: "shieldalert",
        label: "Reset our uplink from our side", hint: "A clean restart might fix it?",
        t: 3, f: 8, once: true,
        out: { k: "cli", lines: ["$ clear session carrier-A", "session resetting...", "session up", "(30 seconds later)", "session down again", "(45 seconds later)", "session up", "WARN: the churn from your reset just caused a secondary flap on another carrier"] },
        plain: "You reset from your side. It came right back up, died again immediately — because the problem isn't on your side. Bonus: the churn rattled another carrier.",
        worse: true,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "Restore focus.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["The smell alone helps. Then the caffeine.", "Your phone buzzes six times during the pour. You do not look at it.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 3, line: "Tier 1: 'Someone just called in screaming the word \\'jitter\\' like it was a slur.'" },
      { at: 5, line: "Tier 1: 'Trading desk at Northridge Capital says they are, quote, \\'losing money by the second\\'.'" },
      { at: 8, line: "A Twitch streamer with 14 viewers is ragequitting live: 'THE ISP IS STEALING MY DUBS.' It's being clipped." },
      { at: 11, line: "A peer's public looking glass shows your prefixes flickering on their side too." },
      { at: 14, line: "r/sysadmin has a thread titled 'anyone else just watching everything flap right now.' 340 comments already." },
      { at: 18, line: "#incidents: 'anyone else seeing this?' — yeah. Everyone who uses this carrier." },
      { at: 22, line: "A customer is demanding to know why our status page is 'all green.' It is not. They are looking at their thermostat app." },
    ],
    intr: [
      {
        id: "security", at: 7, icon: "alert",
        title: "VP of Engineering is paging.",
        body: '"Is this a security thing? Do I need to wake up the security team?"',
        choices: [
          { label: "Not yet — looks like an upstream problem", eff: { t: 1, cred: 5 }, resp: '"OK. Keep me posted. Don\'t make me guess."' },
          { label: "Possibly, still investigating", eff: { t: 2, cred: -5 }, resp: "The security team gets paged unnecessarily. They're not thrilled." },
          { label: "Yes, definitely", eff: { t: 3, cred: -15 }, resp: "The security incident bridge spins up. The post-mortem is going to sting." },
        ],
      },
      {
        id: "kevin_cameo", at: 12, icon: "phone",
        title: "Tier 1: Kevin from Northridge IT is calling. Again.",
        body: '"He wants to know if \'this outage thing\' is why his video call with his nephew froze. His nephew, quote, \'said it\'s probably DNS\'. Do you have any comment on DNS."',
        choices: [
          { label: "Polite: 'Kevin, it\'s carrier-side. It\'s not DNS.'", eff: { t: 1, cred: 5 }, resp: '"\'OK. My nephew said DNS, though. Just so you know.\'"' },
          { label: "Have Tier 1 handle it", eff: { t: 1, cred: 0 }, resp: "Tier 1 sighs the deep sigh of the eternal support engineer." },
          { label: "Ignore and keep working", eff: { t: 0, cred: -5 }, resp: "He'll call back. Kevin always calls back." },
        ],
      },
      {
        id: "customer", at: 16, icon: "phone",
        title: "Enterprise customer on the line.",
        body: '"We run a trading platform. Every 45-second dropout is a problem. What\'s your ETA?"',
        choices: [
          { label: "Realistic ETA (after calling the carrier)", eff: { t: 3, cred: 10 }, resp: "They're unhappy, but they respect the straight answer." },
          { label: "Stall: 'investigating, updates soon'", eff: { t: 1, cred: -5 }, resp: "They hang up. They will call back." },
          { label: "Offer to proactively reroute them", eff: { t: 2, cred: 5 }, resp: "They appreciate it. You'd better actually do it." },
        ],
      },
      {
        id: "crypto_bro", at: 9, icon: "phone",
        title: "A man is screaming. The man is a customer.",
        body: '"MY POSITION. IS LIQUIDATING. I AM DOWN FOUR HUNDRED THOUSAND. DO YOU UNDERSTAND. YOUR INTERNET. IS ROBBING ME."',
        choices: [
          { label: "'Sir — it\\'s intermittent. Move to mobile hotspot while we fix it.'", eff: { t: 1, cred: 5 }, resp: "'I\\'m ON my hotspot. YOUR hotspot. It is ALSO your internet. EVERYTHING is your internet!!' (it is not)" },
          { label: "'We\\'re aware and working on it.'", eff: { t: 1, cred: -5 }, resp: "He will be back in 90 seconds, angrier, and with a slightly different dollar figure." },
          { label: "Mute him and keep working", eff: { t: 0, cred: -10 }, resp: "Tier 1 DMs: 'he just called back. and again. and again. he thinks we hung up on him on purpose. (we did.)'" },
        ],
      },
      {
        id: "yelp_threat", at: 20, icon: "alert",
        title: "Tier 1, weary: 'We\\'ve got a Karen.'",
        body: '"She says she\'s going to, quote, \'leave a Yelp review so bad your mother will see it.\' She also wants to know what \'jitter\' is because her \'son-in-law who works in tech\' used the word. He is an accountant."',
        choices: [
          { label: "Have Tier 1 explain jitter in plain English.", eff: { t: 1, cred: 5 }, resp: "Tier 1 does a remarkable impression of patience. The customer says 'oh. OH. OK.' and hangs up without a goodbye." },
          { label: "'Offer her a service credit and move on.'", eff: { t: 1, cred: 0 }, resp: "She accepts the credit AND writes the Yelp review. It is in all caps. It mentions the word 'jitter' twice." },
          { label: "Ignore it.", eff: { t: 0, cred: -5 }, resp: "She leaves the review anyway. Your mother does not see it. Her mother does." },
        ],
      },
    ],
    diag: [
      { id: "upstream_maint", label: "Unannounced hardware work at the upstream carrier" },
      { id: "ddos", label: "DDoS attack against our infrastructure" },
      { id: "our_bgp", label: "A misconfiguration on our side" },
      { id: "physical", label: "A physical break somewhere on our side" },
      { id: "hijack", label: "Someone hijacking our traffic" },
    ],
  },

  angry: {
    id: "angry",
    title: "Northridge Is Mad",
    tagline: "High-value customer. On fire. About you.",
    diff: "Tricky",
    sla: 20,
    alert: "P1 ESCALATION · NORTHRIDGE FINANCIAL · 'COMPLETELY DOWN' · 40 MIN",
    opener: [
      "Your phone. Tier 1 is calling you directly. That's always bad.",
      '"Hey — sorry. It\'s Kevin. At Northridge. He\'s very angry and he used the word \'lawyers\'. Can you take a look?"',
      "2:47 AM. You already know this one is going to be political before you even log in.",
      "You also already know it's Kevin.",
    ],
    correct: "customer_side",
    backstory: "Northridge's new third-party IT contractor pushed firewall rule changes at 02:07 AM without telling anyone — including Kevin, Northridge's IT director, who has no idea what the contractor was doing. The rules silently dropped all outbound traffic. The contractor is asleep with his phone on silent. Kevin believes the problem is on your side and is yelling at people about it.",
    optimal: ["our_side", "flows", "cpe_stats", "call_kevin", "offer_remote"],
    acts: [
      {
        id: "our_side", cat: "investigate", icon: "search",
        label: "Check our circuit to Northridge", hint: "Is it even down on our side?",
        t: 2, f: 4,
        out: { k: "cli", lines: ["$ show interface xe-2/1/3 | match status|rx|tx", "status: up/up", "Rx: -3.1 dBm (perfect)", "Tx: -2.8 dBm (perfect)", "errors: 0", "uptime: 47 days 14 hours"] },
        plain: "Our circuit is flawless. Up, clean, no errors, hasn't hiccuped in 47 days. Nothing is wrong on our end.",
        evid: [{ cat: "symptoms", txt: "Our-side circuit: perfect, 47-day uptime" }],
      },
      {
        id: "ping_cpe", cat: "investigate", icon: "activity",
        label: "Ping Kevin's router", hint: "Is his box even alive?",
        t: 1, f: 2,
        out: { k: "cli", lines: ["$ ping 10.42.18.1 count 20", "20 packets transmitted, 20 received, 0% loss", "round-trip min/avg/max = 2.1/2.4/3.0 ms"] },
        plain: "Kevin's router responds perfectly. It's alive and reachable. Whatever Kevin is seeing, it is not 'his router is dead'.",
        evid: [{ cat: "symptoms", txt: "Kevin's router: 0% loss — his edge device is up" }],
      },
      {
        id: "flows", cat: "investigate", icon: "activity",
        label: "Check when traffic actually stopped", hint: "Flow history tells you timing",
        t: 3, f: 6,
        out: { k: "cli", lines: ["$ flow-stats northridge --last 2h", "02:00  in:  48 Mbps   out: 31 Mbps   NORMAL", "02:05  in:  50 Mbps   out: 33 Mbps   NORMAL", "02:07  in:   2 Mbps   out: 33 Mbps   ANOMALY", "02:08  in:   0 Mbps   out: 31 Mbps   ANOMALY", "02:45  in:   0 Mbps   out: 28 Mbps   ongoing"] },
        plain: "Traffic coming FROM Northridge stopped at 02:07. Traffic going TO them is still flowing. That's asymmetric — something on Kevin's side is blocking outbound.",
        evid: [{ cat: "timing", txt: "Northridge's outbound stopped at 02:07" }, { cat: "symptoms", txt: "Asymmetric: we can reach them, they can't reach us" }],
      },
      {
        id: "history", cat: "investigate", icon: "search",
        label: "Look at Kevin's support history", hint: "Any pattern here?",
        t: 2, f: 3,
        out: { k: "narrative", lines: ["Last 60 days of Northridge tickets:", "  • 3 tickets — all turned out to be user error on their side", "  • 1 note: 'new IT contractor onboarding this quarter'", "  • Account note: 'Kevin has limited in-house expertise. Be patient.'", "Clean record before the contractor arrived."] },
        plain: "Clean history until recently. Northridge onboarded a new third-party contractor this quarter. Interesting.",
        evid: [{ cat: "changes", txt: "Northridge onboarded a new third-party contractor this quarter" }],
      },
      {
        id: "ring_flap", cat: "investigate", icon: "activity",
        label: "Investigate the 02:15 blip on our ring", hint: "There was a tiny event earlier...",
        t: 4, f: 8,
        out: { k: "cli", lines: ["Ring protection event at 02:15:22", "affected segment: NOT in Northridge's path", "duration: 340ms", "customers impacted: 0 (sub-SLA)", "Inference: real event, but a totally different path", "than Northridge. Coincidence."] },
        plain: "Red herring. A 340ms blip on our ring, on a completely different path. Unrelated to Northridge.",
        evid: [{ cat: "symptoms", txt: "02:15 blip was a different path — coincidence" }],
      },
      {
        id: "cpe_stats", cat: "investigate", icon: "activity",
        label: "Query their router remotely", hint: "See what their box actually looks like",
        t: 3, f: 5,
        out: { k: "cli", lines: ["Remote poll of 10.42.18.1:", "  CPU: 18% (nominal)", "  Memory: 34% (nominal)", "  WAN (to us): up, clean", "  LAN (their office): up, clean", "  LAST CONFIG CHANGE: 02:06:48  (40 minutes ago)"] },
        plain: "Their router is healthy. BUT somebody modified its configuration at 02:06 — one minute before the traffic stopped. That's not a coincidence.",
        evid: [{ cat: "changes", txt: "Kevin's router config was changed at 02:06 — one minute before traffic stopped" }, { cat: "timing", txt: "Config change lines up exactly with the failure" }],
      },
      {
        id: "call_kevin", cat: "escalate", icon: "phone",
        label: "Call Kevin yourself", hint: "Time to have the conversation",
        t: 5, f: 8,
        out: { k: "narrative", lines: ['Kevin picks up on the first ring.', '', '"FINALLY. Forty-three minutes. FORTY-THREE MINUTES."', '', 'You: "Kevin. Our side shows the circuit completely clean. Our monitoring shows your router\'s configuration was changed at 02:06 — that\'s one minute before your traffic stopped. Do you know what that change was?"', '', 'Long silence.', '', '"...our contractor. Daryl. He said he was going to \'harden the firewall\'. He said it would be transparent. He is NOT picking up his phone."', '', '"Also, hypothetical: can we just turn the cloud off and then back on? That\'s a thing, right?"'] },
        plain: "Kevin had no idea his contractor pushed changes. He also asked if you can turn the cloud off and on. This is a customer-side issue.",
        evid: [{ cat: "changes", txt: "Kevin confirms: his contractor made changes around 02:06" }],
      },
      {
        id: "dispatch", cat: "act", icon: "userplus",
        label: "Dispatch a field tech to Northridge", hint: "Eyes-on at their demarc",
        t: 3, f: 4,
        out: { k: "narrative", lines: ['Field tech rolling. 45 min ETA.', '', '(You have a sneaking suspicion this is going to be a billable trip that proves nothing. Kevin will also yell at the tech.)'] },
        plain: "Dispatched a tech. If the evidence so far is right, this is a billable trip with no useful outcome — and Kevin will shout at them.",
        cred: -5,
      },
      {
        id: "offer_remote", cat: "act", icon: "wrench",
        label: "Help Kevin review his firewall config", hint: "Screenshare, fix it together",
        t: 4, f: 6, req: ["call_kevin"],
        out: { k: "narrative", lines: ['Screenshare. You walk Kevin through his router\'s most recent firewall commits:', '', '  02:06:48  firewall rule modified', '    added: deny any any log', '    (above the permit rules)', '', 'An implicit-deny rule above all the allow rules. His contractor ordered them wrong. Classic rookie mistake.', '', 'Kevin: "So... that\'s the problem?"', 'You: "Yes, Kevin."', 'Kevin: "So it wasn\'t the cloud?"', 'You: "No, Kevin."', 'Kevin: "Are you SURE it wasn\'t the cloud?"'] },
        plain: "Kevin's contractor put a 'block everything' rule above his 'allow' rules. Fixed it.",
        evid: [{ cat: "symptoms", txt: "Root cause: misordered firewall rules on Kevin's router" }],
        restore: true,
      },
      {
        id: "escalate", cat: "escalate", icon: "userplus",
        label: "Call the senior engineer", hint: "Costs credibility, buys a hint",
        t: 8, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: ['Senior eng: "Asymmetric traffic, our side clean, their router pings fine? Check their last config change timestamp. If it lines up with the incident, it\'s them. Don\'t let an angry customer scare you into chasing ghosts on our side."'] },
        plain: "Senior engineer: check their config timestamps. Don't let Kevin pressure you into looking the wrong way.",
      },
      {
        id: "cowboy", cat: "act", icon: "shieldalert",
        label: "Bounce the circuit to 'show Kevin you tried'", hint: "He's yelling...",
        t: 3, f: 6, once: true,
        out: { k: "cli", lines: ["$ request interface xe-2/1/3 down && up", "interface flapping...", "Kevin reports TOTAL loss of inbound during the reset:", "'OH MY GOD WHAT DID YOU JUST DO'", "'WHY IS THIS WORSE NOW'", "session restored, original problem unchanged"] },
        plain: "You bounced a circuit that was already fine. It cut inbound traffic briefly during the reset. Kevin is apocalyptic. The actual problem is still there.",
        worse: true,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "Restore focus.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["Bitter. Hot. Necessary.", "Kevin calls while you are pouring. You let it ring. You deserve this.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 3, line: "Account manager: 'Kevin is typing. Then deleting. Then typing. He\\'s composing something.'" },
      { at: 4, line: "Slack DM from your manager: 'I'm watching this one. Loop me in when you have something.'" },
      { at: 7, line: "Kevin: 'hello??? is anyone ON the case??? we are a PAYING CUSTOMER???'" },
      { at: 9, line: "Account manager in #northridge-war-room: 'Kevin is... emotional. Anything I can relay?'" },
      { at: 12, line: "Kevin just left a one-star Google review with the words 'criminal, honestly.' Our ratings team is in a meeting about it already." },
      { at: 15, line: "Kevin just tweeted about 'our ISP' from his personal account. It's not complimentary. It is misspelled." },
      { at: 18, line: "Kevin's LinkedIn status: 'Looking to connect with any ISP lawyers. For a friend. Not me. For a friend.'" },
    ],
    intr: [
      {
        id: "account_mgr", at: 6, icon: "phone",
        title: "Account manager is calling.",
        body: '"Northridge pays us six figures. Kevin just texted our CEO the words \'legal team\'. I don\'t care whose fault it is. Give me something I can say."',
        choices: [
          { label: "Share the evidence so far, factually", eff: { t: 2, cred: 10 }, resp: '"Our circuit is clean, their router config changed right before the outage. Got it — I\'ll spin it diplomatically."' },
          { label: "Say 'it looks like their side' without evidence yet", eff: { t: 1, cred: -10 }, resp: "Account manager is skeptical. You\'re making a claim you can't support yet. She'd have to repeat it to Kevin." },
          { label: "Ask for 10 more minutes", eff: { t: 0, cred: -5 }, resp: '"Fine. Ten. Not eleven."' },
        ],
      },
      {
        id: "kevin_wacky", at: 10, icon: "phone",
        title: "Kevin is calling. Again.",
        body: '"OK hear me out. Could this be the \'solar flares\'? My nephew said solar flares. Also — we pay for the FAST internet, not the slow one. I want the FAST one turned back on. Immediately."',
        choices: [
          { label: "Patient: 'Kevin, it\'s not solar flares. There\'s also only one internet.'", eff: { t: 2, cred: 5 }, resp: "He sighs. 'Fine. But I\'m telling my nephew you said that.'" },
          { label: "'Kevin, I\'ll call you back in five.'", eff: { t: 1, cred: 0 }, resp: "He\'ll call back in four." },
          { label: "Lie: 'Yes, solar flares. We\'re on it.'", eff: { t: 0, cred: -20 }, resp: "He IMMEDIATELY tweets about the solar flares. This will be a meme by morning." },
        ],
      },
      {
        id: "manager", at: 14, icon: "alert",
        title: "Your manager pings.",
        body: '"This is a Tier 1 account and Kevin is unhinged. What are you finding?"',
        choices: [
          { label: "Walk through the evidence trail", eff: { t: 2, cred: 10 }, resp: '"Solid work. Keep the customer looped in."' },
          { label: "Say you're being thorough, no conclusions yet", eff: { t: 1, cred: -5 }, resp: '"Thorough is good. Faster is better. Update me in 10."' },
        ],
      },
      {
        id: "kevin_wife", at: 17, icon: "phone",
        title: "Kevin, but somehow louder.",
        body: '"OK my WIFE just made a very good point. She said: \'Kevin. Ask them if it\'s because you changed the WiFi password.\' I changed the WiFi password three weeks ago. COULD that be related. Be honest."',
        choices: [
          { label: "'No, Kevin. No, it could not.'", eff: { t: 1, cred: 5 }, resp: "'She is going to be SO wrong. I am SO excited to tell her.'" },
          { label: "'Kevin — this is a firewall rule, not WiFi.'", eff: { t: 2, cred: 10 }, resp: "'So you\\'re saying this WOULD have worked if I hadn\\'t changed the password. Got it.' (he did not get it.)" },
          { label: "Lie: 'Yes — actually, change it back.'", eff: { t: 0, cred: -20 }, resp: "Kevin changes the WiFi password again. The entire Northridge office gets kicked off WiFi. Now there are TWO outages." },
        ],
      },
    ],
    diag: [
      { id: "customer_side", label: "Kevin's contractor broke Kevin's own firewall" },
      { id: "our_circuit", label: "Our circuit to Northridge has failed" },
      { id: "ring_event", label: "Our 02:15 blip caused this" },
      { id: "cpe_hardware", label: "Kevin's router hardware has failed" },
      { id: "upstream_route", label: "An upstream routing issue affecting them" },
    ],
  },

  kevin: {
    id: "kevin",
    title: "Kevin Calls Again",
    tagline: "'The whole internet is broken.' (It is not.)",
    diff: "Easy",
    sla: 18,
    alert: "INBOUND CALL · KEVIN (NORTHRIDGE) · 'EVERYTHING IS DOWN'",
    opener: [
      "Your phone rings. Caller ID: NORTHRIDGE — KEVIN.",
      "You stare at it. You let it go to voicemail.",
      "It immediately rings again. You pick up.",
      '"Hi — yeah. Our entire internet. Gone. Completely gone."',
      '"Kevin, I can see you\'re texting me right now. How are you texting me?"',
      '"...that\'s a different internet."',
    ],
    correct: "user_side",
    backstory: "Kevin unplugged the office router while the cleaning crew was vacuuming. He didn't realize he'd unplugged it. He's on his phone's cellular data — which is why he can text, call, and tweet about the 'outage' while claiming the internet is down. Nothing is wrong with your network. Kevin is, as ever, Kevin.",
    optimal: ["our_side", "ping_kevin", "walk_kevin", "lights_check", "replug"],
    acts: [
      {
        id: "our_side", cat: "investigate", icon: "search",
        label: "Check our circuit to Kevin's office", hint: "First: is this even real?",
        t: 1, f: 2,
        out: { k: "cli", lines: ["$ show interface northridge-kevin | match status", "status: up/up", "errors: 0", "Rx: -2.9 dBm (perfect)", "uptime: 412 days 6 hours"] },
        plain: "Our circuit to Kevin's office is flawless. Four hundred and twelve days without a hiccup. Whatever's happening on Kevin's end, it's not our circuit.",
        evid: [{ cat: "symptoms", txt: "Our side: perfect. 412-day uptime." }],
      },
      {
        id: "ping_kevin", cat: "investigate", icon: "activity",
        label: "Ping Kevin's router", hint: "Is his box alive?",
        t: 1, f: 3,
        out: { k: "cli", lines: ["$ ping 10.99.18.1 count 10", "PING 10.99.18.1", "Request timeout for icmp_seq 0", "Request timeout for icmp_seq 1", "Request timeout for icmp_seq 2", "...", "10 packets transmitted, 0 received, 100% loss"] },
        plain: "Kevin's router is not responding at all. Either it's off, it's unplugged, or something's blocking it. Our side is still perfect — so the break is on Kevin's side of the wall.",
        evid: [{ cat: "symptoms", txt: "Kevin's router: not responding at all" }, { cat: "scope", txt: "Problem is on Kevin's side of the demarc" }],
      },
      {
        id: "traffic_check", cat: "investigate", icon: "activity",
        label: "Check when traffic actually stopped", hint: "Did it fail, or just disappear?",
        t: 2, f: 4,
        out: { k: "cli", lines: ["$ flow-stats northridge-kevin --last 30m", "02:30  in: 12 Mbps  out: 8 Mbps   NORMAL", "02:34  in: 11 Mbps  out: 7 Mbps   NORMAL", "02:35  in:  0 Mbps  out: 0 Mbps   ← cliff", "02:45  in:  0 Mbps  out: 0 Mbps   ongoing"] },
        plain: "Traffic didn't gradually degrade. It went off a cliff at 02:35 — boom, zero. That's not a failing circuit. That's something on Kevin's side losing power.",
        evid: [{ cat: "timing", txt: "Clean cliff at 02:35 — instant, not gradual" }, { cat: "symptoms", txt: "Instant-zero pattern matches power loss, not equipment failure" }],
      },
      {
        id: "walk_kevin", cat: "escalate", icon: "phone",
        label: "Walk Kevin through some basic checks on the phone", hint: "The hard part: talking to Kevin",
        t: 4, f: 6,
        out: { k: "narrative", lines: [
          'You: "Kevin, can you look at the router? The box with the blinking lights?"',
          'Kevin: "...what does a router look like."',
          'You: "Small. Black. Antennas. It\'s probably in a closet."',
          'Kevin: "OK I am looking at a closet."',
          '(a full minute of rustling noises)',
          'Kevin: "There is a box in here. Is THIS a router?"',
          'You: "Does it have blinking lights?"',
          'Kevin: "No."',
          'You: "Any lights at all?"',
          'Kevin: "...no."',
          'You: "Kevin. The router is off."',
          'Kevin: "Well, WHY is it off."',
        ] },
        plain: "Kevin is standing in front of the router. It has no lights. It's off. The problem is power.",
        evid: [{ cat: "symptoms", txt: "Kevin confirms: router has no lights. No power." }],
      },
      {
        id: "lights_check", cat: "investigate", icon: "search",
        label: "Ask Kevin to check the power cable", hint: "The root cause is almost certainly physical",
        t: 3, f: 5, req: ["walk_kevin"],
        out: { k: "narrative", lines: [
          'You: "Kevin, can you check the power cable?"',
          'Kevin: "You want me to look BEHIND the router?"',
          'You: "Yes, Kevin. Behind the router."',
          '(noises of a grown man crouching)',
          'Kevin: "Oh."',
          'You: "Oh what, Kevin."',
          'Kevin: "The cable is — um. Not in the wall."',
          'You: "Why is the cable not in the wall, Kevin?"',
          'Kevin: "Marta was vacuuming."',
          'You: "Uh huh."',
          'Kevin: "We pay extra for Marta."',
        ] },
        plain: "The router is unplugged. Marta the cleaner unplugged it while vacuuming. Kevin did not notice.",
        evid: [{ cat: "changes", txt: "Router power cable was unplugged, unreported, ~02:35" }],
      },
      {
        id: "cellular_check", cat: "investigate", icon: "activity",
        label: "Ask how Kevin is 'on the internet' right now", hint: "He's been texting you the whole time",
        t: 2, f: 3,
        out: { k: "narrative", lines: [
          'You: "Kevin, quick question. How are you on TikTok right now?"',
          'Kevin: "Different internet."',
          'You: "Different... internet."',
          'Kevin: "The phone internet. The one ON the phone."',
          'You: "Kevin, that\'s cellular data."',
          'Kevin: "Right."',
          'You: "It is still the internet."',
          'Kevin: "It is a different internet, though."',
          'You: "It is not."',
          'Kevin: "Agree to disagree."',
        ] },
        plain: "Kevin thinks his phone's cellular data is 'a different internet.' This is why he's been simultaneously claiming total outage AND tweeting about it.",
        evid: [{ cat: "scope", txt: "Kevin's 'total outage' claim contradicted by Kevin being online this whole time" }],
      },
      {
        id: "replug", cat: "act", icon: "zap",
        label: "Have Kevin plug the router back in", hint: "The fix is literally plugging it in",
        t: 3, f: 4, req: ["lights_check"],
        out: { k: "narrative", lines: [
          'You: "Kevin, plug the router back in."',
          'Kevin: "Into the wall?"',
          'You: "Into the wall."',
          '(mechanical click)',
          'Kevin: "Oh. Lights."',
          '(60 seconds pass.)',
          'Kevin: "The internet is back. How did you do that?"',
          'You: "I did not do anything, Kevin."',
          'Kevin: "Incredible work. I am going to tell the CEO."',
        ] },
        plain: "Router is back up. Traffic resuming. Kevin will tell everyone that you personally 'fixed the internet.'",
        evid: [{ cat: "symptoms", txt: "Router power restored — all traffic flowing" }],
        restore: true,
      },
      {
        id: "senior", cat: "escalate", icon: "userplus",
        label: "Call the senior engineer", hint: "Costs credibility. Might not be worth it.",
        t: 6, f: 0, cred: -15, once: true,
        out: { k: "narrative", lines: [
          'Senior eng, groggy: "...is this Kevin?"',
          'You: "It\'s Kevin."',
          'Senior eng: "It\'s always Kevin. Check if his router has lights. No lights = power. Lights = his own firewall. It\'s never the network."',
          'Senior eng: "Also — next time, please do not wake me up for Kevin."',
        ] },
        plain: "Senior engineer confirms: it's Kevin. It's always Kevin. Check power first, firewall second. Do not page a senior for Kevin.",
      },
      {
        id: "cowboy", cat: "act", icon: "shieldalert",
        label: "Just tell Kevin it's DNS so he hangs up", hint: "His nephew did say DNS...",
        t: 1, f: 4, once: true,
        out: { k: "narrative", lines: [
          'You: "Kevin, it\'s — it\'s DNS."',
          'Kevin: "I KNEW IT. My nephew SAID DNS."',
          '(Kevin hangs up.)',
          '(Ten minutes later, your account manager slacks you:',
          '"Kevin just told the CEO our network has \'the DNS.\'',
          'Our CEO is now asking me what DNS is. Please advise.")',
          'WARN: the entire Northridge account team now believes we have "a DNS problem." Internal memo incoming.',
        ] },
        plain: "You told Kevin it was DNS. Kevin believed you. Kevin told the CEO. The account team is now in a panic about a made-up DNS problem you invented to get Kevin off the phone.",
        worse: true,
      },
      {
        id: "coffee", cat: "act", icon: "coffee",
        label: "Pour a coffee", hint: "You deserve this.",
        t: 2, f: -20,
        out: { k: "narrative", lines: ["Cream. Sugar. A resigned sigh.", "Your phone shows 'KEVIN (17 missed)'. You do not look at it. You sip.", "(focus restored)"] },
      },
    ],
    ambient: [
      { at: 3, line: "Kevin texted: 'are u there??? HELLO?????' (you replied 4 seconds ago)" },
      { at: 4, line: "Slack DM from your manager: 'Is this Kevin again.'" },
      { at: 6, line: "Kevin: 'btw we pay you people $189 A MONTH. just so ur aware.'" },
      { at: 8, line: "Kevin just tweeted: 'our ISP is INCOMPETENT also has anyone heard of DNS'. 4 likes. Two are bots." },
      { at: 11, line: "Kevin has opened a BBB complaint. You are CC'd. The subject line is 'COMPLETE INCOMPATENCE' (his spelling)." },
      { at: 12, line: "Tier 1: 'Kevin\\'s CEO is now calling Kevin. Kevin is not answering Kevin\\'s CEO.'" },
      { at: 15, line: "Kevin: 'i am filming this for my nephew he said he wants to see'" },
    ],
    intr: [
      {
        id: "kevin_nephew", at: 3, icon: "phone",
        title: "Kevin is already back. Thirty-two seconds.",
        body: '"OK so my nephew — 14, very smart, already runs a Minecraft server — he just said it\'s \'probably DNS\'. What is your take on that. Professionally."',
        choices: [
          { label: "'Kevin, DNS has nothing to do with what you\\'re describing.'", eff: { t: 1, cred: 5 }, resp: "'OK but just so we\\'re on the same page, my NEPHEW, fourteen, already caught something YOU missed.'" },
          { label: "'Let me look into that.'", eff: { t: 0, cred: -5 }, resp: '"GREAT. He\'s going to be THRILLED. I\'m texting him now."' },
          { label: "'Please put your nephew on the phone.'", eff: { t: 2, cred: 5 }, resp: "Silence. Then: 'He\\'s at school.' It is 2:51 AM." },
        ],
      },
      {
        id: "kevin_5g", at: 5, icon: "phone",
        title: "Kevin has a new theory.",
        body: '"OK so — what if it\'s the 5G? I read that 5G slows down the internet. We are SURROUNDED by 5G out here. Can you turn the 5G off?"',
        choices: [
          { label: "Patient: 'Kevin, 5G is a phone thing. Not your office.'", eff: { t: 1, cred: 5 }, resp: "'...OK. But can you still turn it off? As a favor. For me.'" },
          { label: "'Kevin, I cannot turn off 5G.'", eff: { t: 0, cred: 0 }, resp: '"Can I talk to your manager about that."' },
          { label: "Agree: 'Sure, turning off the 5G now.'", eff: { t: 0, cred: -15 }, resp: "Kevin tells the whole office you turned off the 5G. The whole office is now asking when their WiFi will come back on." },
        ],
      },
      {
        id: "kevin_recording", at: 8, icon: "alert",
        title: "Kevin, suddenly calmer. Suspiciously calmer.",
        body: '"Just so you know, I AM recording this call. For my lawyer. Who is also my brother. Who is a dentist. But still a lawyer, because he took a class."',
        choices: [
          { label: "'Kevin, you\\'re welcome to record. Let\\'s keep going.'", eff: { t: 1, cred: 5 }, resp: "'OK good. Because he\\'s going to WATCH this. Eventually. After his root canal schedule clears.'" },
          { label: "'A dentist is not a lawyer, Kevin.'", eff: { t: 2, cred: 0 }, resp: "'He has a FRAMED DEGREE. On his WALL. So.'" },
          { label: "Hang up and call him back.", eff: { t: 3, cred: -10 }, resp: "He picks up on ring one. 'Did you just HANG UP on me. I have that on tape now too.'" },
        ],
      },
      {
        id: "kevin_cloud", at: 10, icon: "phone",
        title: "Kevin, again.",
        body: '"OK hear me out. Can we turn the cloud off and on? Like... the whole cloud. IT guys do that, right?"',
        choices: [
          { label: "'Kevin. The cloud is not a thing you reboot.'", eff: { t: 1, cred: 5 }, resp: '"OK but HYPOTHETICALLY. If you COULD turn off the cloud. Would it fix this?"' },
          { label: "Play along: 'I\'ll put in the ticket.'", eff: { t: 0, cred: -10 }, resp: "Kevin will now check every 45 seconds if the ticket is done." },
          { label: "Mute Kevin and keep working", eff: { t: 0, cred: 0 }, resp: "He will call back. He always calls back." },
        ],
      },
      {
        id: "marta", at: 14, icon: "alert",
        title: "Tier 1: Kevin has a follow-up.",
        body: '"Kevin wants to know if \'the vacuum\' could have caused this. Marta is apparently in tears. She thinks she\'s going to get fired."',
        choices: [
          { label: "'Yes — the vacuum is how the router came unplugged. Please reassure Marta.'", eff: { t: 1, cred: 5 }, resp: "Marta, told it wasn't her fault, un-quits. Kevin takes credit for 'solving the mystery.'" },
          { label: "'We\\'re still investigating.'", eff: { t: 1, cred: -5 }, resp: "Marta quits. Somehow this is your fault now." },
        ],
      },
      {
        id: "kevin_ceo", at: 17, icon: "phone",
        title: "Unknown number. You answer anyway. You shouldn't have.",
        body: '"Hi — this is Douglas, I\'m Kevin\'s CEO. Kevin tells me you\'ve \'broken the cloud\' and there is, quote, \'a DNS.\' Could you help me understand what a DNS is, in plain English, for me, the CEO."',
        choices: [
          { label: "'Douglas, respectfully — Kevin unplugged the router.'", eff: { t: 2, cred: 15 }, resp: "Long silence. 'I see. I will speak to Kevin.' You hear a door close, very firmly, in the background." },
          { label: "'It\\'s a little complicated, Douglas.'", eff: { t: 2, cred: -5 }, resp: "'Well — try me. I played BASE-ball in college. I can follow a CURVE-ball.'" },
          { label: "'Kevin is lying to you, Douglas.'", eff: { t: 1, cred: -5 }, resp: "'That\\'s a strong word. I\\'m going to need it in writing. With letterhead.'" },
        ],
      },
    ],
    diag: [
      { id: "user_side", label: "Kevin's router is unplugged (nothing is actually wrong)" },
      { id: "our_circuit", label: "Our circuit to Northridge has failed" },
      { id: "dns", label: "A DNS issue (as Kevin's nephew suggested)" },
      { id: "cpe_hardware", label: "Kevin's router hardware has died" },
      { id: "the_5g", label: "5G interference (Kevin's other theory)" },
    ],
  },
};

// ============ RAGE QUEUE POOL ============
// A pool of angry "callers" who join the queue during an incident.
// Each has a short hook — a theory, a complaint, or a threat. They drain
// credibility over time if ignored; reassuring them costs a minute but buys
// credibility back; hanging up is free but expensive in reputation.
const RAGE_POOL = [
  { nm: "Barbara",       th: "demands you 'turn off the 5G.' All of it." },
  { nm: "Dennis (ranked apex)", th: "will 'remember this' come performance review. He does not work for you." },
  { nm: "Margaret",      th: "is composing a Yelp review live. It has already said 'criminal.'" },
  { nm: "Raj (trading desk)", th: "claims losses 'by the second.' Will not define 'by.'" },
  { nm: "Tim (wedding)", th: "needs to upload 4,800 RAW files 'before sunrise.'" },
  { nm: "Lauren",        th: "is watching a raccoon on her Ring doorbell. It is, quote, 'the story of her life.'" },
  { nm: "Chad",          th: "says his 'nephew in IT' has confirmed it's DNS." },
  { nm: "Priya",         th: "said 'lawyers' inside the first twenty seconds." },
  { nm: "Doug",          th: "is recording this 'for evidence.' You can hear his hold music in his echo." },
  { nm: "Cheryl",        th: "thinks it's 'the weather.' It is, in fact, not raining." },
  { nm: "Marcus",        th: "pays 'A LOT of money.' Account shows $42/mo." },
  { nm: "Hiromi",        th: "has said 'escalate this' seven consecutive times." },
  { nm: "Blake (twitch)", th: "is streaming this call to 14 viewers. Eight left." },
  { nm: "Ellen",         th: "keeps saying 'my time is valuable.' Nobody asked." },
  { nm: "Stan",          th: "thinks the issue is Mercury in retrograde. And 'also maybe fiber.'" },
  { nm: "Janet",         th: "insists she can 'smell' when the internet is slow." },
];

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
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

function EvidenceBoard({ evid }: any) {
  const total: number = Object.values(evid).reduce<number>((a, b: any) => a + b.length, 0);
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

// ============ RAGE QUEUE SIDEBAR ============
function RageQueue({ customers, patienceOf, onCalm, onDismiss }) {
  return (
    <div className="bg-zinc-900 border border-red-900/40 rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-red-400 tracking-widest">// ANGRY CUSTOMERS</div>
        <div className="text-[10px] text-zinc-600">{customers.length} on the line</div>
      </div>
      {customers.length === 0 ? (
        <div className="text-xs text-zinc-600 italic pl-1">Silence. Enjoy it while it lasts.</div>
      ) : (
        <div className="space-y-2">
          {customers.map(c => {
            const p = patienceOf(c);
            const barColor = p < 30 ? "bg-red-500" : p < 60 ? "bg-amber-500" : "bg-green-500";
            return (
              <div key={c.id} className="bg-zinc-950 border border-zinc-800 rounded p-2">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="text-xs text-zinc-200 font-medium truncate">{c.nm}</div>
                  <div className={`text-[10px] ${p < 30 ? "text-red-400" : "text-zinc-500"}`}>{Math.round(p)}%</div>
                </div>
                <div className="text-[11px] text-zinc-400 italic mb-2 leading-snug">{c.th}</div>
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
                  <div className={`h-full transition-all ${barColor}`} style={{ width: `${p}%` }}/>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onCalm(c.id)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-green-700/50 rounded px-2 py-1 text-[10px] text-zinc-200 transition"
                    title="Spend 2 minutes reassuring them. +6 cred."
                  >
                    Reassure (-2m)
                  </button>
                  <button
                    onClick={() => onDismiss(c.id)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-red-700/50 rounded px-2 py-1 text-[10px] text-red-400 transition"
                    title="Free, but they'll remember. -8 cred."
                  >
                    Hang up
                  </button>
                </div>
              </div>
            );
          })}
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

  // Keyboard nav inside the modal:
  //  - digits 1-N pick an option
  //  - Enter / Return commits (when a selection exists)
  //  - D also closes the modal (so the same hotkey that opened it can close it)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter") {
        if (sel) { e.preventDefault(); onCommit(sel); }
        return;
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        onCancel();
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= sc.diag.length) {
        e.preventDefault();
        setSel(sc.diag[n - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, sc.diag, onCommit, onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-green-600/50 rounded-md max-w-xl w-full p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-green-400 tracking-widest uppercase">// Commit Root Cause</div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4"/></button>
        </div>
        <div className="text-sm text-zinc-400 mb-4 leading-relaxed">
          You're about to commit to a diagnosis. This ends your investigation.
          {evidCount < 4 && <div className="text-amber-400 text-xs mt-2">⚠ Only {evidCount} pieces of evidence gathered — committing early is risky.</div>}
        </div>
        <div className="space-y-2 mb-5">
          {sc.diag.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setSel(d.id)}
              onDoubleClick={() => onCommit(d.id)}
              className={`w-full text-left rounded px-3 py-2.5 transition text-sm border flex items-center justify-between gap-3 ${sel === d.id ? "bg-green-900/40 border-green-500 text-zinc-100" : "bg-zinc-800 border-zinc-700 hover:border-zinc-600 text-zinc-300"}`}
            >
              <span>{d.label}</span>
              <kbd className="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 font-mono flex-shrink-0">{i + 1}</kbd>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 justify-end">
          <div className="text-[10px] text-zinc-600 mr-auto italic">
            <kbd className="px-1 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-[10px]">1-{sc.diag.length}</kbd> pick · <kbd className="px-1 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-[10px]">Enter</kbd> commit · <kbd className="px-1 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-[10px]">Esc</kbd> close
          </div>
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
    ["D", "Open / close the Commit Diagnosis dialog"],
    ["C", "Pour a coffee (if available)"],
    ["M", "Mute / unmute sound"],
    ["?", "Toggle this help"],
    ["Esc", "Close dialogs"],
    ["1-N · Enter", "(inside Diagnose) pick option + commit"],
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
  // Rage queue — live list of angry customers on the line
  const [customers, setCustomers] = useState([]);
  const [nextSpawnAt, setNextSpawnAt] = useState(() => 2 + Math.floor(Math.random() * 3));
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

  // ----- RAGE QUEUE -----
  // Patience decays at ~10/min per customer. If it hits zero they hang up
  // furious — credibility takes a serious hit.
  const patienceOf = (c) => Math.max(0, 100 - (elapsed - c.joinedAt) * 10);

  // Auto-leave: when elapsed advances past a customer's patience window, they
  // bail. Fires on any elapsed change.
  useEffect(() => {
    if (!openerDone) return;
    setCustomers(cs => {
      const left = cs.filter(c => elapsed - c.joinedAt >= 10);
      if (left.length === 0) return cs;
      const hit = left.length * 12;
      setCred(cr => clamp(cr - hit, 0, 100));
      addLog(left.map(c => ({
        k: "ambient",
        text: `${c.nm} hung up. ${c.nm} is composing an email to your CEO. (-12 cred)`,
      })));
      sound.beep(150, 220, 0.07);
      return cs.filter(c => elapsed - c.joinedAt < 10);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, openerDone]);

  // Spawn new customers as elapsed advances past nextSpawnAt.
  useEffect(() => {
    if (!openerDone) return;
    if (elapsed < nextSpawnAt) return;
    if (customers.length >= 4) return;
    const pool = RAGE_POOL.filter(p => !customers.some(c => c.nm === p.nm));
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const id = `c-${elapsed}-${Math.random().toString(36).slice(2, 7)}`;
    setCustomers(cs => [...cs, { id, nm: pick.nm, th: pick.th, joinedAt: elapsed }]);
    setNextSpawnAt(elapsed + 3 + Math.floor(Math.random() * 4));
    addLog([{ k: "ambient", text: `${pick.nm} just joined the queue: ${pick.th}` }]);
    sound.beep(420, 55, 0.045);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, nextSpawnAt, openerDone]);

  const calmCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    setCustomers(cs => cs.filter(x => x.id !== id));
    setSla(s => s - 2);
    setCred(cr => clamp(cr + 6, 0, 100));
    const newElapsed = elapsed + 2;
    setElapsed(newElapsed);
    addLog([{ k: "ambient", text: `Reassured ${c.nm}. They agreed to 'think about it.' (+6 cred, -2m)` }]);
    sound.beep(680, 60, 0.04);
  };

  const dismissCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    setCustomers(cs => cs.filter(x => x.id !== id));
    setCred(cr => clamp(cr - 8, 0, 100));
    addLog([{ k: "ambient", text: `Sent ${c.nm} to hold music. ${c.nm} did not appreciate it. (-8 cred)` }]);
    sound.beep(200, 70, 0.04);
  };

  // Shuffle interrupt content across its own time slots for each new run.
  // Interrupts marked `anchor: true` keep their original timing (plot beats).
  // Everyone else gets randomly reassigned across the remaining slots, so the
  // same scenario feels different on replay — new Kevin theories, new order.
  const scheduledIntrs = useMemo(() => {
    const all = [...(sc.intr || [])];
    const anchors = all.filter(i => i.anchor);
    const pool = all.filter(i => !i.anchor);
    const anchorAts = new Set(anchors.map(a => a.at));
    const openSlots = all.map(i => i.at).filter(a => !anchorAts.has(a));
    // Fisher-Yates shuffle the pool
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const rescheduled = pool.map((intr, i) => ({ ...intr, at: openSlots[i] ?? intr.at }));
    return [...anchors, ...rescheduled].sort((a, b) => a.at - b.at);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scKey]);

  const checkInterrupt = (newElapsed) => {
    for (const intr of scheduledIntrs) {
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

    const entries: any[] = [{ k: "action", label: a.label, t: tCost }];
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
    // Firing criteria — any of these and HR calls you in the morning:
    //   - You made it worse AND also got the diagnosis wrong
    //   - Your credibility collapsed below 20
    //   - You made it worse AND blew the SLA by 10+ minutes
    const fired =
      (worseTriggered && !correct) ||
      cred < 20 ||
      (worseTriggered && slaLeft <= -10);
    let outcome;
    if (fired) outcome = "fired";
    else if (worseTriggered) outcome = "worse";
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
      // Breach + trashed credibility or a secondary outage = you're fired, not just breached
      const fired = cred < 20 || (worseTriggered && sla <= -10);
      onEnd({
        outcome: fired ? "fired" : "breach", scKey, diagId: null, correct: false,
        slaLeft: sla, cred, focus, evidCount, score,
        achievements: [], optimalHit, optimalTotal,
        doneActIds: [...doneActs],
      });
    }
  }, [sla, curIntr, openerDone, scKey, cred, focus, evid, doneActs, onEnd, sc.optimal, worseTriggered]);

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

        {/* Evidence board + rage queue */}
        <div className="md:sticky md:top-[74px] md:self-start space-y-4">
          <EvidenceBoard evid={evid}/>
          <RageQueue
            customers={customers}
            patienceOf={patienceOf}
            onCalm={calmCustomer}
            onDismiss={dismissCustomer}
          />
          <div className="text-[10px] text-zinc-600 italic leading-relaxed">
            Evidence fills in as you investigate. Angry customers drain credibility — calm them down or cut them loose.
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
  fired: {
    title: "YOU'RE FIRED",
    color: "text-red-300",
    border: "border-red-700/70",
    bg: "bg-red-950/40",
    tag: "HR wants a word. It is a short word. It starts with 'B'.",
  },
};

// ============ POST-MORTEM GENERATOR ============
// Produces a shareable markdown post-mortem from the run — blameless tone,
// quotes the player's actual actions. Handy for bragging or for confessing.
function buildPostMortem(result, sc) {
  const end = ENDINGS[result.outcome];
  const yourDiag = sc.diag.find(d => d.id === result.diagId);
  const correctDiag = sc.diag.find(d => d.id === sc.correct);
  const actions = (result.doneActIds || [])
    .map(id => sc.acts.find(a => a.id === id))
    .filter(Boolean);

  const outcomeNarrative = {
    clean: "Resolved cleanly, well within SLA. Nobody ever knows.",
    squeaker: "Resolved correctly, but cut uncomfortably close to the SLA.",
    wrong_fix: "Service was restored, but the root cause diagnosis was incorrect. The fix held — for the wrong reasons.",
    wrong: "Incorrect root cause committed. Service impact extended.",
    breach: "SLA breached. Customer-facing impact extended past the contractual window.",
    worse: "Operator action during the incident caused a secondary outage, compounding customer impact.",
    fired: "Operator has been relieved of their on-call responsibilities.",
  }[result.outcome] || "Incident concluded.";

  const lessons = [];
  if (!result.correct) lessons.push("- Commit criteria needed more evidence across all four categories before cutover.");
  if (result.slaLeft < 5) lessons.push("- Too many investigative cycles before a parallel-path containment was attempted.");
  if ((result.optimalHit || 0) / (result.optimalTotal || 1) < 0.6) lessons.push("- Several high-signal investigative steps were skipped.");
  if (result.cred < 60) lessons.push("- Customer-facing communications cadence drifted during the incident. Tighter updates next time.");
  if (result.outcome === "worse") lessons.push("- Reversible-first: any mutating action during the incident should have been preceded by a dry-run.");
  if (result.outcome === "fired") lessons.push("- Operator is encouraged to explore opportunities outside the on-call rotation.");
  if (lessons.length === 0) lessons.push("- No systemic issues identified. Runbook captured as-is.");

  const title = `# Post-Mortem: ${sc.title}`;
  const meta = `**Outcome:** ${end.title}  \n**Score:** ${result.score ?? 0}  \n**Scenario difficulty:** ${sc.diff}  \n**SLA target:** ${sc.sla} min  \n**SLA remaining at resolution:** ${result.slaLeft} min  \n**Final credibility:** ${result.cred}/100`;
  const summary = `## Summary\n${outcomeNarrative}`;
  const diag = `## Root cause\n- **Diagnosed:** ${yourDiag ? yourDiag.label : "_no diagnosis committed (SLA breach)_"}\n- **Actual:** ${correctDiag.label}\n- **Correct?** ${result.correct ? "Yes" : "No"}`;
  const backstory = `## What actually happened\n${sc.backstory}`;
  const timeline = `## Actions taken (in order)\n${actions.length === 0 ? "_No investigative actions were recorded._" : actions.map((a, i) => `${i + 1}. ${a.label}`).join("\n")}`;
  const evidence = `## Evidence gathered\n${result.evidCount} item${result.evidCount === 1 ? "" : "s"} across the investigation.`;
  const lessonsBlock = `## Lessons learned\n${lessons.join("\n")}`;
  const achievements = (result.achievements && result.achievements.length > 0)
    ? `\n## Achievements unlocked\n${result.achievements.map(([n, d]) => `- **${n}** — ${d}`).join("\n")}`
    : "";
  const footer = `\n---\n_Generated by Escape the Outage. It's 2:47 AM somewhere._`;

  return [title, meta, summary, diag, backstory, timeline, evidence, lessonsBlock + achievements, footer].join("\n\n");
}

function Ending({ result, onRestart, onTitle, crt }) {
  const sc = SCENARIOS[result.scKey];
  const end = ENDINGS[result.outcome];
  const correctDiag = sc.diag.find(d => d.id === sc.correct);
  const yourDiag = sc.diag.find(d => d.id === result.diagId);
  const [copied, setCopied] = useState(false);

  const copyPostMortem = async () => {
    const md = buildPostMortem(result, sc);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback: put it in a prompt so the user can still copy manually
      window.prompt("Post-mortem (copy manually):", md);
    }
  };

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

        <div className="flex gap-3 flex-wrap">
          <button onClick={onRestart} className="flex-1 min-w-[140px] bg-green-600 hover:bg-green-500 text-black font-semibold px-4 py-3 rounded transition flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4"/> Run it back
          </button>
          <button onClick={onTitle} className="flex-1 min-w-[140px] bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 px-4 py-3 rounded transition flex items-center justify-center gap-2">
            <Play className="w-4 h-4"/> Pick a scenario
          </button>
          <button
            onClick={copyPostMortem}
            className={`flex-1 min-w-[160px] px-4 py-3 rounded transition flex items-center justify-center gap-2 ${copied ? "bg-green-900/40 border border-green-600/60 text-green-300" : "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200"}`}
            title="Copy a blameless markdown post-mortem to your clipboard"
          >
            {copied ? <Check className="w-4 h-4"/> : <Copy className="w-4 h-4"/>}
            {copied ? "Copied" : "Copy post-mortem"}
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

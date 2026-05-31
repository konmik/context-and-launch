# Heartbeat

- Client opens a WebSocket to the server on page load
- Server registers the connection as a peer
  - If a shutdown timer is pending, cancel it
- Client sends a ping every 10 seconds
  - Server replies with pong
- Connection closes (tab closed, network drop)
  - Server removes the peer
  - Peer count reaches zero
    - Server schedules shutdown after 30 seconds
    - Another peer connects before the timer fires
      - Cancel shutdown
    - Timer fires with no peers
      - Server exits the process
- Client detects connection loss
  - Reconnects with exponential backoff (2s initial, 10s max)
- Tab becomes visible again while disconnected
  - Resets backoff and reconnects immediately

-- Track whether the sponsor-reply notification email actually
-- dispatched successfully. Prior to this column, the sendEmail call
-- inside /api/admin/messages/[id]/reply was best-effort with a
-- try/catch that only wrote a console warning on failure. Kevin
-- had no way to eyeball from the admin queue whether the email
-- actually went out — silent failures were possible and untraceable.
--
-- Non-null = SendGrid accepted the email at this timestamp.
-- Null with an existing reply row = email either never fired or
-- failed inside the catch. Admin queue surfaces this as "Email
-- pending — resend" so Kevin can manually re-fire the notification.

ALTER TABLE kid_messages
  ADD COLUMN IF NOT EXISTS sponsor_notified_at TIMESTAMP WITH TIME ZONE;

-- Backfill: every existing kid_to_sponsor reply predates this column,
-- and we know from ops history those went out (or Kevin would have
-- complained). Stamp them with deliveredAt so the queue doesn't
-- immediately look like a mountain of "email pending" cards on first
-- deploy. Only backfills replies, not sponsor->kid parents.
UPDATE kid_messages
   SET sponsor_notified_at = delivered_at
 WHERE direction = 'kid_to_sponsor'
   AND sponsor_notified_at IS NULL;

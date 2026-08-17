/**
 * Telegram Forwarding Settings — "SMTP Settings" panel.
 *
 * NOTE: The original stores credentials under the key `smtp_settings`
 * but it is actually Telegram bot config: host = bot token, user = chat ID.
 * This naming must be preserved exactly.
 *
 * Ported from saveSmtpSettings() / testSmtpSettings() at lines 12375–12428.
 */

import { useState, useEffect } from 'react';
import { getTelegramSettings, saveTelegramSettings } from '../../services/storage/smtp';
import { useToast } from '../../app/providers/ToastProvider';
import { DismissIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';

interface TelegramSettingsProps {
  onClose: () => void;
}

export function TelegramSettings({ onClose }: TelegramSettingsProps) {
  const { toast } = useToast();
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [testResult, setTestResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const s = getTelegramSettings();
    setBotToken(s.botToken);
    setChatId(s.chatId);
  }, []);

  function handleSave() {
    if (!botToken || !chatId) { toast('Bot Token and Chat ID are required', 'error'); return; }
    saveTelegramSettings({ botToken, chatId });
    toast('Telegram settings saved', 'success');
    onClose();
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      if (!botToken) throw new Error('Bot Token is empty');
      const meResp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const meData = await meResp.json() as { ok: boolean; description?: string; result?: { username: string } };
      if (!meData.ok) throw new Error(meData.description || 'Invalid bot token');
      if (chatId) {
        const msgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ Outlook rule notifier connected!\nBot: @${meData.result?.username}`,
            parse_mode: 'HTML',
          }),
        });
        const msgData = await msgResp.json() as { ok: boolean; description?: string };
        if (!msgData.ok) throw new Error(msgData.description || 'Could not send test message — check Chat ID');
        setTestResult({ msg: `✓ Test message sent via @${meData.result?.username}`, ok: true });
      } else {
        setTestResult({ msg: `✓ Bot @${meData.result?.username} is valid. Add a Chat ID to send a test message.`, ok: true });
      }
    } catch (e) {
      setTestResult({ msg: '✗ ' + (e as Error).message, ok: false });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal onClose={onClose} id="telegramSettingsModal">
        <div className="modal-header">
          <h2>Telegram Notification Settings</h2>
          <button className="modal-close" onClick={onClose}>
            <DismissIcon size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 6 }}>
            When a local rule fires with "Notify via Telegram", the matching email summary is sent to this bot.
          </div>

          <div className="form-group">
            <label className="form-label">Bot Token</label>
            <input
              id="smtpHost"
              className="form-input"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456:ABCdef..."
            />
            <div className="form-hint">Get this from @BotFather on Telegram</div>
          </div>

          <div className="form-group">
            <label className="form-label">Chat ID</label>
            <input
              id="smtpUser"
              className="form-input"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="e.g. -1001234567890 or your user ID"
            />
            <div className="form-hint">Use @userinfobot to find your chat ID</div>
          </div>

          {testResult && (
            <div
              id="smtpTestResult"
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 13,
                marginTop: 8,
                background: testResult.ok ? '#dff6dd' : '#fde7e9',
                color: testResult.ok ? '#107c10' : '#a4262c',
              }}
            >
              {testResult.msg}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button className="modal-btn primary" onClick={handleSave}>Save Settings</button>
        </div>
    </Modal>
  );
}

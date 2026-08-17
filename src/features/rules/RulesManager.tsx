/**
 * Rules Manager modal — local-only console rules (client-side filtering).
 *
 * Ported from showRulesModal() / createRule() / openEditRule() at lines 11254–11700.
 *
 * KEY: Rules are stored per-account under `local_console_rules_<safe_email>`.
 * Auto-migrates legacy global `local_console_rules` key on first load.
 */

import { useEffect, useState } from 'react';
import { loadLocalConsoleRules, saveLocalConsoleRules } from '../../services/storage/rules';
import type { LocalConsoleRule as LocalRule } from '../../types';
import { useFoldersStore } from '../../store/folders';
import { useToast } from '../../app/providers/ToastProvider';
import { useAccountsStore } from '../../store/accounts';
import { DismissIcon } from '../../components/icons';

interface RulesManagerProps {
  onClose: () => void;
}

const CONDITION_TYPES = [
  ['from', 'From (exact)'],
  ['fromDomain', 'From domain'],
  ['to', 'To (exact)'],
  ['senderAddressIncludes', 'Sender address includes'],
  ['recipientAddressIncludes', 'Recipient address includes'],
  ['subjectIncludes', 'Subject includes'],
  ['subjectExact', 'Subject is exactly'],
  ['subjectOrBodyIncludes', 'Subject or body includes'],
  ['bodyIncludes', 'Body includes'],
  ['hasAttachment', 'Has attachment'],
  ['isUnread', 'Is unread'],
  ['importanceIs', 'Importance'],
  ['sizeGreaterThan', 'Size greater than (KB)'],
  ['sizeLessThan', 'Size less than (KB)'],
  ['receivedAfter', 'Received after (date)'],
  ['receivedBefore', 'Received before (date)'],
  ['categoryIs', 'Category is'],
  ['headerContains', 'Header contains'],
] as const;

const PRIMARY_FOLDERS = [
  { label: 'Inbox', id: 'inbox' },
  { label: 'Drafts', id: 'drafts' },
  { label: 'Sent Items', id: 'sentitems' },
  { label: 'Deleted Items', id: 'deleteditems' },
  { label: 'Junk Email', id: 'junkemail' },
  { label: 'Archive', id: 'archive' },
];

const CONDITION_MAP: Record<string, string> = Object.fromEntries(CONDITION_TYPES);

interface ConditionRow { type: string; value: string; }

export function RulesManager({ onClose }: RulesManagerProps) {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const { folders } = useFoldersStore();
  const { toast } = useToast();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;

  const [rules, setRules] = useState<LocalRule[]>([]);
  const [editingRule, setEditingRule] = useState<(LocalRule & { _idx: number }) | null>(null);
  const [conditions, setConditions] = useState<ConditionRow[]>([{ type: 'from', value: '' }]);
  const [actionType, setActionType] = useState('moveToFolder');
  const [destFolder, setDestFolder] = useState('inbox');
  const [copyDestFolder, setCopyDestFolder] = useState('inbox');
  const [markAsRead, setMarkAsRead] = useState(false);
  const [forwardEnabled, setForwardEnabled] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState(true);
  const [ruleName, setRuleName] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (account) setRules(loadLocalConsoleRules(account.email));
  }, [account]);

  function save(updated: LocalRule[]) {
    if (account) saveLocalConsoleRules(updated, account.email);
    setRules(updated);
  }

  function toggleRule(idx: number) {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], isEnabled: !updated[idx].isEnabled };
    save(updated);
  }

  function deleteRule(idx: number) {
    if (!confirm(`Delete rule "${rules[idx]?.displayName}"?`)) return;
    const updated = rules.filter((_, i) => i !== idx);
    save(updated);
    toast('Rule deleted', 'success');
  }

  function openNew() {
    setIsEditing(false);
    setRuleName('');
    setConditions([{ type: 'from', value: '' }]);
    setActionType('moveToFolder');
    setDestFolder('inbox');
    setCopyDestFolder('inbox');
    setMarkAsRead(false);
    setForwardEnabled(false);
    setCategoryLabel('');
    setRuleEnabled(true);
    setShowEditor(true);
  }

  function openEdit(idx: number) {
    const rule = rules[idx];
    setIsEditing(true);
    setRuleName(rule.displayName || '');
    const conds = Array.isArray(rule.conditions?.all)
      ? rule.conditions.all
      : rule.conditions?.type && rule.conditions?.value
        ? [{ type: rule.conditions.type, value: rule.conditions.value }]
        : [{ type: 'from', value: '' }];
    setConditions(conds.length > 0 ? conds : [{ type: 'from', value: '' }]);
    setMarkAsRead(!!rule.actions?.markAsRead);
    setForwardEnabled(!!rule.actions?.forwardTo);
    setRuleEnabled(rule.isEnabled !== false);
    if (rule.actions?.permanentDelete) { setActionType('permanentDelete'); }
    else if (rule.actions?.copyToFolder) { setActionType('copyToFolder'); setCopyDestFolder(rule.actions.copyToFolder || 'inbox'); }
    else if (rule.actions?.flagMessage) { setActionType('flagMessage'); }
    else if (rule.actions?.markImportant) { setActionType('markImportant'); }
    else if (rule.actions?.categorize) { setActionType('categorize'); setCategoryLabel(rule.actions.categorize); }
    else { setActionType('moveToFolder'); setDestFolder(rule.actions?.moveToFolder || 'inbox'); }
    setEditingRule({ ...rule, _idx: idx });
    setShowEditor(true);
  }

  function handleSave() {
    if (!ruleName.trim()) { toast('Rule name is required', 'error'); return; }
    if (conditions.length === 0) { toast('At least one condition is required', 'error'); return; }

    const actions: LocalRule['actions'] = { markAsRead };
    if (actionType === 'moveToFolder') actions.moveToFolder = destFolder;
    else if (actionType === 'permanentDelete') actions.permanentDelete = true;
    else if (actionType === 'copyToFolder') actions.copyToFolder = copyDestFolder;
    else if (actionType === 'flagMessage') actions.flagMessage = true;
    else if (actionType === 'markImportant') actions.markImportant = true;
    else if (actionType === 'categorize') actions.categorize = categoryLabel;
    if (forwardEnabled) actions.forwardTo = 'telegram';

    const rule: LocalRule = {
      id: isEditing && editingRule ? editingRule.id : Date.now().toString(),
      displayName: ruleName.trim(),
      isEnabled: ruleEnabled,
      conditions: { all: conditions.filter((c) => c.type && c.value.trim()) },
      actions,
    };

    let updated: LocalRule[];
    if (isEditing && editingRule) {
      updated = rules.map((r, i) => i === editingRule._idx ? rule : r);
      toast('Rule saved', 'success');
    } else {
      updated = [...rules, rule];
      toast('Rule created', 'success');
    }

    save(updated);
    setShowEditor(false);
    setEditingRule(null);
  }

  const allFolders = [
    ...PRIMARY_FOLDERS,
    ...folders.filter((f) => !PRIMARY_FOLDERS.some((p) => p.label.toLowerCase().replace(/\s+/g,'') === f.displayName.toLowerCase().replace(/\s+/g,''))).map((f) => ({ label: f.displayName, id: f.id })),
  ];

  return (
    <div className="modal-overlay" id="rulesModal">
      <div className="modal" style={{ width: 800, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Rules</h2>
          <button className="modal-close" onClick={onClose}>
            <DismissIcon size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, padding: 0 }}>
          {/* Rule list */}
          {!showEditor ? (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {rules.length} local rule{rules.length !== 1 ? 's' : ''} — applied client-side during sync
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="modal-btn primary" onClick={openNew}>+ New Rule</button>
                </div>
              </div>

              <div id="rulesListPanel" style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                {rules.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30 }}>No local rules configured. Click "+ New Rule" to create one.</p>
                ) : rules.map((rule, i) => {
                  const conds = Array.isArray(rule.conditions?.all)
                    ? rule.conditions.all
                    : rule.conditions?.type ? [{ type: rule.conditions.type, value: rule.conditions.value }] : [];
                  const condStr = conds.map((c) => (CONDITION_MAP[c.type] || c.type) + ': ' + c.value).join(' AND ') || 'any message';
                  const actParts: string[] = [];
                  if (rule.actions?.forwardTo) actParts.push('Notify via Telegram');
                  if (rule.actions?.markAsRead) actParts.push('Mark as read');
                  if (rule.actions?.moveToFolder) actParts.push('Move to: ' + (rule.actions.moveToFolderName || rule.actions.moveToFolder));
                  if (rule.actions?.copyToFolder) actParts.push('Copy to: ' + (rule.actions.copyToFolderName || rule.actions.copyToFolder));
                  if (rule.actions?.permanentDelete) actParts.push('Delete permanently');
                  if (rule.actions?.flagMessage) actParts.push('Flag');
                  if (rule.actions?.markImportant) actParts.push('Mark important');
                  if (rule.actions?.categorize) actParts.push('Categorize: ' + rule.actions.categorize);
                  const actStr = actParts.join(', ') || 'no action';

                  return (
                    <div key={rule.id ?? i} className="rule-item" style={{ cursor: 'pointer' }} onClick={() => openEdit(i)}>
                      <div className={`rule-enabled ${rule.isEnabled ? 'on' : 'off'}`} />
                      <div className="rule-info">
                        <div className="rule-name">{rule.displayName} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(local)</span></div>
                        <div className="rule-desc">IF {condStr} THEN {actStr}</div>
                      </div>
                      <div className="rule-actions">
                        <button className="rule-action-btn" onClick={(e) => { e.stopPropagation(); toggleRule(i); }} title={rule.isEnabled ? 'Disable' : 'Enable'}>
                          <svg viewBox="0 0 24 24"><path d={rule.isEnabled ? 'M17 7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z' : 'M17 7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zM7 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z'} /></svg>
                        </button>
                        <button className="rule-action-btn danger" onClick={(e) => { e.stopPropagation(); deleteRule(i); }} title="Delete">
                          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            // Rule editor
            <div id="createRuleModal" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }} id="ruleModalTitle">{isEditing ? 'Edit Rule' : 'Create Rule'}</h3>
                <button className="modal-btn secondary" onClick={() => setShowEditor(false)}>← Back</button>
              </div>

              <div className="form-group">
                <label className="form-label">Rule Name</label>
                <input id="ruleName" className="form-input" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g., Move newsletters" />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ marginBottom: 6 }}>Conditions (ALL must match)</label>
                <div id="ruleConditionsWrap" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {conditions.map((cond, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        className="form-input"
                        style={{ width: 220, flexShrink: 0 }}
                        value={cond.type}
                        onChange={(e) => setConditions((prev) => prev.map((c, ci) => ci === i ? { ...c, type: e.target.value } : c))}
                      >
                        {CONDITION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <input
                        className="form-input"
                        style={{ flex: 1 }}
                        value={cond.value}
                        onChange={(e) => setConditions((prev) => prev.map((c, ci) => ci === i ? { ...c, value: e.target.value } : c))}
                        placeholder="value (comma-separated for multiple)"
                      />
                      {conditions.length > 1 && (
                        <button style={{ border: 'none', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: 18, width: 28, flexShrink: 0 }}
                          onClick={() => setConditions((prev) => prev.filter((_, ci) => ci !== i))}>×</button>
                      )}
                    </div>
                  ))}
                  <button className="modal-btn secondary" style={{ alignSelf: 'flex-start', padding: '3px 10px', fontSize: 12 }}
                    onClick={() => setConditions((prev) => [...prev, { type: 'from', value: '' }])}>+ Add condition</button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Primary Action</label>
                <select id="ruleAction" className="form-input" value={actionType} onChange={(e) => setActionType(e.target.value)}>
                  <option value="moveToFolder">Move to folder</option>
                  <option value="copyToFolder">Copy to folder</option>
                  <option value="permanentDelete">Delete permanently</option>
                  <option value="flagMessage">Flag for follow-up</option>
                  <option value="markImportant">Mark as important</option>
                  <option value="categorize">Categorize</option>
                </select>
              </div>

              {actionType === 'moveToFolder' && (
                <div className="form-group" id="ruleActionFolderGroup">
                  <label className="form-label">Destination folder</label>
                  <select id="ruleDestFolder" className="form-input" value={destFolder} onChange={(e) => setDestFolder(e.target.value)}>
                    {allFolders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              )}

              {actionType === 'copyToFolder' && (
                <div className="form-group" id="ruleActionCopyFolderGroup">
                  <label className="form-label">Copy to folder</label>
                  <select id="ruleCopyDestFolder" className="form-input" value={copyDestFolder} onChange={(e) => setCopyDestFolder(e.target.value)}>
                    {allFolders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              )}

              {actionType === 'categorize' && (
                <div className="form-group" id="ruleActionCategoryGroup">
                  <label className="form-label">Category label</label>
                  <input id="ruleCategoryLabel" className="form-input" value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} placeholder="e.g., Important, Newsletter" />
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={markAsRead} onChange={(e) => setMarkAsRead(e.target.checked)} id="ruleMarkAsRead" />
                  Also mark as read
                </label>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={forwardEnabled} id="ruleForwardCheck" onChange={(e) => setForwardEnabled(e.target.checked)} />
                  Notify via Telegram when matched
                </label>
                <div className="form-hint">Configure the bot &amp; chat ID in Settings (gear icon, top right)</div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={ruleEnabled} id="ruleEnabled" onChange={(e) => setRuleEnabled(e.target.checked)} />
                  Rule is enabled
                </label>
              </div>
            </div>
          )}
        </div>

        {showEditor && (
          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={() => setShowEditor(false)}>Cancel</button>
            <button className="modal-btn primary" id="ruleModalSaveBtn" onClick={handleSave}>{isEditing ? 'Save Changes' : 'Create Rule'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

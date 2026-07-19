'use client'

import type {
  AdminAuditEvent,
  AdminAuditList,
  AdminOperator,
  SupportLookupReason,
  SupportUserSummary,
} from '@myfitness/contracts'
import { useEffect, useState, type FormEvent } from 'react'

type Props = {
  localLoginEnabled: boolean
  oidcEnabled: boolean
}

type UiError = { message: string; lookupReceiptId?: string }

const reasonOptions: Array<{ value: SupportLookupReason; label: string; detail: string }> = [
  { value: 'account_access', label: '账户访问', detail: '登录、身份或会话问题' },
  { value: 'data_export', label: '数据导出', detail: '用户请求自己的便携副本' },
  { value: 'account_erasure', label: '账户删除', detail: '核对已发起的永久删除问题' },
  { value: 'technical_issue', label: '技术故障', detail: '定位不涉及内容浏览的系统问题' },
]

const actionLabels: Record<AdminAuditEvent['action'], string> = {
  'operator.session.created': '操作员会话建立',
  'operator.session.denied': '操作员会话拒绝',
  'operator.session.revoked': '操作员会话撤销',
  'operator.profile.read': '操作员身份核对',
  'support.user.lookup': '账户证据查询',
  'audit.events.read': '审计证据读取',
  'authorization.denied': '角色权限拒绝',
}

const roleLabels: Record<AdminOperator['roles'][number], string> = {
  support_reader: '支持只读',
  audit_reader: '审计只读',
}

const statusLabels = {
  active: '正常',
  disabled: '已停用',
  deletion_pending: '删除处理中',
} as const

const consentLabels = {
  never_granted: '从未授权',
  active: '当前有效',
  revoked: '已撤回',
} as const

const formatTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        hour12: false,
      }).format(new Date(value))
    : '无记录'

const parseError = async (response: Response): Promise<UiError> => {
  try {
    const body = (await response.json()) as { message?: unknown; lookupReceiptId?: unknown }
    return {
      message: typeof body.message === 'string' ? body.message : '请求没有完成。',
      ...(typeof body.lookupReceiptId === 'string'
        ? { lookupReceiptId: body.lookupReceiptId }
        : {}),
    }
  } catch {
    return { message: '请求没有完成。' }
  }
}

export function AdminConsole({ localLoginEnabled, oidcEnabled }: Props) {
  const [operator, setOperator] = useState<AdminOperator | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [accountId, setAccountId] = useState('')
  const [ticketReference, setTicketReference] = useState('')
  const [reason, setReason] = useState<SupportLookupReason>('technical_issue')
  const [summary, setSummary] = useState<SupportUserSummary | null>(null)
  const [events, setEvents] = useState<AdminAuditEvent[]>([])
  const [working, setWorking] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [error, setError] = useState<UiError | null>(null)

  const loadAudit = async (currentOperator: AdminOperator) => {
    if (!currentOperator.roles.includes('audit_reader')) return
    setAuditLoading(true)
    const response = await fetch('/api/audit?limit=12', { cache: 'no-store' })
    if (response.ok) {
      const data = (await response.json()) as AdminAuditList
      setEvents(data.events)
    }
    setAuditLoading(false)
  }

  useEffect(() => {
    const initialize = async () => {
      const response = await fetch('/api/operator/session', { cache: 'no-store' })
      if (response.ok) {
        const data = (await response.json()) as { operator: AdminOperator }
        setOperator(data.operator)
        await loadAudit(data.operator)
      }
      setLoadingSession(false)
    }
    void initialize()
  }, [])

  const signInLocal = async () => {
    setWorking(true)
    setError(null)
    const response = await fetch('/api/operator/dev-session', { method: 'POST' })
    if (!response.ok) {
      setError(await parseError(response))
    } else {
      const data = (await response.json()) as { operator: AdminOperator }
      setOperator(data.operator)
      await loadAudit(data.operator)
    }
    setWorking(false)
  }

  const signOut = async () => {
    setWorking(true)
    await fetch('/api/operator/session', { method: 'DELETE' })
    setOperator(null)
    setSummary(null)
    setEvents([])
    setError(null)
    setWorking(false)
  }

  const lookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWorking(true)
    setError(null)
    setSummary(null)
    const response = await fetch('/api/support/users/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: accountId.trim().toLowerCase(),
        ticketReference: ticketReference.trim().toUpperCase(),
        reason,
      }),
    })
    if (!response.ok) {
      setError(await parseError(response))
    } else {
      setSummary((await response.json()) as SupportUserSummary)
      if (operator) await loadAudit(operator)
    }
    setWorking(false)
  }

  if (loadingSession) {
    return (
      <main className="session-loading" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        <p>正在核对操作员边界…</p>
      </main>
    )
  }

  if (!operator) {
    return (
      <main className="access-shell">
        <section className="access-card" aria-labelledby="access-title">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              衡
            </span>
            <div>
              <p className="eyebrow">MYFITNESS · EVIDENCE DESK</p>
              <p className="brand-name">衡迹支持证据台</p>
            </div>
          </div>
          <div className="access-thesis">
            <p className="boundary-label">OPERATOR BOUNDARY / 01</p>
            <h1 id="access-title">
              先证明身份，
              <br />
              再查看最少信息。
            </h1>
            <p>
              这里没有用户内容浏览、资料修改或账户代操作。每次进入、查询和拒绝都会留下不可变证据。
            </p>
          </div>
          <ul className="access-conditions" aria-label="访问条件">
            <li>
              <span>身份</span>OIDC 签名与预配操作员
            </li>
            <li>
              <span>权限</span>支持只读 / 审计只读
            </li>
            <li>
              <span>留痕</span>请求号与 HMAC 目标指纹
            </li>
          </ul>
          <div className="access-actions">
            {oidcEnabled ? (
              <a className="primary-action" href="/api/operator/oidc/login">
                使用企业身份登录
              </a>
            ) : null}
            {localLoginEnabled ? (
              <button
                className="secondary-action"
                type="button"
                onClick={signInLocal}
                disabled={working}
              >
                {working ? '正在建立本地会话…' : '进入本地只读演示'}
              </button>
            ) : null}
            {!oidcEnabled && !localLoginEnabled ? (
              <p className="configuration-note">管理员身份提供方尚未配置，工作台保持关闭。</p>
            ) : null}
          </div>
          <p className="legal-note">普通用户 Bearer 与操作员 Bearer 永不互换。</p>
          {error ? (
            <p className="error-note" role="alert">
              {error.message}
            </p>
          ) : null}
        </section>
      </main>
    )
  }

  const canSupport = operator.roles.includes('support_reader')
  const canAudit = operator.roles.includes('audit_reader')

  return (
    <main className="desk-shell">
      <header className="desk-header">
        <div className="brand-lockup compact">
          <span className="brand-mark" aria-hidden="true">
            衡
          </span>
          <div>
            <p className="eyebrow">EVIDENCE DESK</p>
            <p className="brand-name">支持证据台</p>
          </div>
        </div>
        <div className="operator-strip" aria-label="当前操作员">
          <span className="operator-status">
            <i aria-hidden="true" /> 已验证
          </span>
          <span>{operator.displayName}</span>
          <span className="operator-provider">{operator.identityProvider.toUpperCase()}</span>
          <button type="button" onClick={signOut} disabled={working}>
            撤销会话
          </button>
        </div>
      </header>

      <section className="desk-intro" aria-labelledby="desk-title">
        <p className="boundary-label">READ-ONLY SUPPORT / ITERATION 014</p>
        <h1 id="desk-title">证据够用，内容不越界。</h1>
        <p>
          精确账户、明确工单、限定原因。查询结果只呈现生命周期与聚合证据，不展示训练、饮食、健康或照片内容。
        </p>
        <div className="role-row" aria-label="当前角色">
          {operator.roles.map((role) => (
            <span key={role}>{roleLabels[role]}</span>
          ))}
        </div>
      </section>

      <div className="desk-grid">
        <section className="lookup-panel" aria-labelledby="lookup-title">
          <div className="section-heading">
            <span>01 / REQUEST</span>
            <div>
              <h2 id="lookup-title">建立查询依据</h2>
              <p>不支持姓名、手机号、邮箱或模糊搜索。</p>
            </div>
          </div>
          {canSupport ? (
            <form onSubmit={lookup} className="lookup-form">
              <label>
                <span>精确账户 ID</span>
                <input
                  name="accountId"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  placeholder="00000000-0000-4000-8000-000000000000"
                  pattern="[0-9a-fA-F-]{36}"
                  autoComplete="off"
                  required
                />
              </label>
              <label>
                <span>工单号</span>
                <input
                  name="ticketReference"
                  value={ticketReference}
                  onChange={(event) => setTicketReference(event.target.value.toUpperCase())}
                  placeholder="SUP-2026-001"
                  pattern="[A-Z0-9][A-Z0-9._-]{2,39}"
                  autoComplete="off"
                  required
                />
              </label>
              <fieldset>
                <legend>查询原因</legend>
                <div className="reason-grid">
                  {reasonOptions.map((option) => (
                    <label
                      className={
                        reason === option.value ? 'reason-option selected' : 'reason-option'
                      }
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="reason"
                        value={option.value}
                        checked={reason === option.value}
                        onChange={() => setReason(option.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="lookup-action" type="submit" disabled={working}>
                {working ? '正在写入访问证据…' : '记录依据并查询'}
              </button>
            </form>
          ) : (
            <div className="permission-empty">
              <strong>当前角色没有支持查询权限</strong>
              <p>审计角色只能核对访问证据，不能读取账户摘要。</p>
            </div>
          )}
          {error ? (
            <div className="error-note block" role="alert">
              <strong>查询未完成</strong>
              <span>{error.message}</span>
              {error.lookupReceiptId ? <code>审计凭据 {error.lookupReceiptId}</code> : null}
            </div>
          ) : null}
        </section>

        <aside className="evidence-rail" aria-labelledby="audit-title">
          <div className="rail-rule" aria-hidden="true" />
          <div className="section-heading rail-heading">
            <span>ACCESS PROOF</span>
            <div>
              <h2 id="audit-title">访问证据轨</h2>
              <p>{canAudit ? '最近 12 条不可变事件' : '需要审计只读角色'}</p>
            </div>
          </div>
          {canAudit ? (
            auditLoading ? (
              <p className="rail-empty">正在读取审计证据…</p>
            ) : events.length ? (
              <ol className="audit-list">
                {events.map((event) => (
                  <li key={event.eventId} className={`outcome-${event.outcome}`}>
                    <span className="audit-mark" aria-hidden="true" />
                    <div>
                      <strong>{actionLabels[event.action]}</strong>
                      <p>
                        {formatTime(event.occurredAt)} ·{' '}
                        {event.outcome === 'allowed'
                          ? '允许'
                          : event.outcome === 'denied'
                            ? '拒绝'
                            : '未找到'}
                      </p>
                      <code>
                        {event.requestId.slice(0, 8)} ·{' '}
                        {event.targetRef?.slice(0, 10) ?? 'NO TARGET'}
                      </code>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rail-empty">还没有可显示的访问证据。</p>
            )
          ) : (
            <p className="rail-empty">角色分离会阻止支持人员浏览全局审计。</p>
          )}
        </aside>
      </div>

      <section className="result-panel" aria-live="polite" aria-labelledby="result-title">
        <div className="section-heading">
          <span>02 / EVIDENCE</span>
          <div>
            <h2 id="result-title">账户证据摘要</h2>
            <p>只有完成留痕的精确查询才会出现在这里。</p>
          </div>
        </div>
        {summary ? (
          <AccountSummary summary={summary} />
        ) : (
          <div className="result-empty">
            <span aria-hidden="true">—</span>
            <p>未加载账户。这里不会预取、推荐或列出用户。</p>
          </div>
        )}
      </section>
    </main>
  )
}

function AccountSummary({ summary }: { summary: SupportUserSummary }) {
  const counts = [
    ['身体/恢复', summary.account.evidenceCounts.healthRecords],
    ['训练', summary.account.evidenceCounts.workouts],
    ['饮食', summary.account.evidenceCounts.meals],
    ['周计划', summary.account.evidenceCounts.weeklyPlans],
    ['AI 解释', summary.account.evidenceCounts.aiExplanations],
    ['照片分析', summary.account.evidenceCounts.photoAnalyses],
    ['授权凭据', summary.account.evidenceCounts.consentReceipts],
  ] as const
  return (
    <div className="account-summary">
      <div className="account-identity">
        <p className="summary-label">ACCOUNT</p>
        <code>{summary.account.accountId}</code>
        <span className={`account-status status-${summary.account.status}`}>
          {statusLabels[summary.account.status]}
        </span>
        <dl>
          <div>
            <dt>创建</dt>
            <dd>{formatTime(summary.account.createdAt)}</dd>
          </div>
          <div>
            <dt>最近活动</dt>
            <dd>{formatTime(summary.account.latestActivityAt)}</dd>
          </div>
          <div>
            <dt>身份来源</dt>
            <dd>{summary.account.identityProviders.join(' / ') || '无'}</dd>
          </div>
          <div>
            <dt>有效会话</dt>
            <dd>{summary.account.activeSessionCount}</dd>
          </div>
        </dl>
      </div>
      <div className="evidence-counts">
        <p className="summary-label">BOUNDED COUNTS</p>
        <ul>
          {counts.map(([label, count]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </div>
      <div className="privacy-state">
        <p className="summary-label">CUSTODY STATE</p>
        <dl>
          <div>
            <dt>建档</dt>
            <dd>
              {summary.account.onboarding.profilePresent
                ? `已完成 · v${summary.account.onboarding.profileRevision}`
                : '未完成'}
            </dd>
          </div>
          <div>
            <dt>目标</dt>
            <dd>{summary.account.onboarding.goalPresent ? '已存在' : '未建立'}</dd>
          </div>
          <div>
            <dt>AI 解释授权</dt>
            <dd>{consentLabels[summary.account.optionalConsents.aiPlanExplanation]}</dd>
          </div>
          <div>
            <dt>照片分析授权</dt>
            <dd>{consentLabels[summary.account.optionalConsents.foodPhotoAnalysis]}</dd>
          </div>
          <div>
            <dt>留存照片</dt>
            <dd>{summary.account.activePhotoCount}</dd>
          </div>
        </dl>
      </div>
      <footer className="lookup-receipt">
        <span>LOOKUP RECEIPT</span>
        <code>{summary.lookupReceiptId}</code>
        <time>{formatTime(summary.auditedAt)}</time>
      </footer>
    </div>
  )
}

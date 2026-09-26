import { useState, useCallback, useEffect } from 'react';
import { adminPost } from '../api';
import type { CommandCenterSummary, Lead } from '../types';

export function useBusinessSummary() {
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>('');

  const loadSummary = useCallback(() => {
    setLoading(true);
    setError(null);
    adminPost('get-command-center-summary', { windowDays: 30 })
      .then(setSummary)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadLeads = useCallback((status?: string) => {
    setLeadsLoading(true);
    adminPost('list-leads', status ? { status } : {})
      .then(setLeads)
      .catch(() => {})
      .finally(() => setLeadsLoading(false));
  }, []);

  useEffect(() => { loadSummary(); loadLeads(); }, [loadSummary, loadLeads]);

  async function updateLeadStatus(id: string, status: string) {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, status } : l)));
    try {
      await adminPost('patch-lead', { id, fields: { status, last_contacted_at: new Date().toISOString() } });
      loadSummary();
    } catch {
      loadLeads(leadStatusFilter || undefined); // revert to server truth on failure
    }
  }

  async function submitSpend(row: { date: string; channel: string; amount: number }) {
    await adminPost('add-marketing-spend', { row });
    loadSummary();
  }

  return {
    summary, loading, error, loadSummary,
    leads, leadsLoading, leadStatusFilter, setLeadStatusFilter, loadLeads,
    updateLeadStatus, submitSpend,
  };
}

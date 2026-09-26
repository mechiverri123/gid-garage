import { CustomerCard } from '../components/cards/CustomerCard';
import { JobCard } from '../components/cards/JobCard';
import { LeadCard } from '../components/cards/LeadCard';
import { CallCard } from '../components/cards/CallCard';
import { MarketingCard } from '../components/cards/MarketingCard';
import { PricingCard } from '../components/cards/PricingCard';
import { OwnerPayCard } from '../components/cards/OwnerPayCard';
import { BusinessSummaryCard } from '../components/cards/BusinessSummaryCard';
import { GenericCard } from '../components/cards/GenericCard';

// Maps a backend tool name (admin-ai-chat.js) to the card component that
// renders its result. Add a line here whenever a new "presentable" tool is
// added on the backend (see PRESENTABLE_TOOLS in admin-ai-chat.js) — that
// set and this map should stay in sync.
export const RESULT_COMPONENTS: Record<string, React.ComponentType<{ payload: any }>> = {
  search_customers: CustomerCard,
  list_jobs: JobCard,
  list_leads: LeadCard,
  list_calls: CallCard,
  list_marketing_spend: MarketingCard,
  pricing_history: PricingCard,
  get_owner_pay_summary: OwnerPayCard,
  get_business_summary: BusinessSummaryCard,
};

export function resultComponentFor(tool: string): React.ComponentType<{ payload: any }> {
  return RESULT_COMPONENTS[tool] || GenericCard;
}

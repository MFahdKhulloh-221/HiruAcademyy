"use client";

import { AdminReferralProgram } from "@/components/admin-referral-program";
import { AdminInvoicePrototype } from "@/components/admin-invoice-prototype";
import { AdminUsersPrototype } from "@/components/admin-users-prototype";

export const InvoiceOperations = AdminInvoicePrototype;
export const UserMembershipOperations = AdminUsersPrototype;
export function AffiliateOperations({ initialTab: _initialTab }: { initialTab?: string }) {
  void _initialTab;
  return <AdminReferralProgram />;
}

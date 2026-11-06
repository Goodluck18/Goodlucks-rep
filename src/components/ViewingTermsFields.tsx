import React from 'react';
import { Info } from 'lucide-react';
import type { ViewingTermsValues } from '../types';

/**
 * Task 03: the per-property viewing fee and viewing terms fields.
 *
 * One component so the agent's submission form and the "change the fee on a
 * live listing" editor cannot drift apart. The fee is required and has no
 * default: the platform no longer has a universal viewing fee, and a blank box
 * here is a blank box on the server too.
 */

export interface ViewingTermsFormState {
  feeGhs: string;
  appointmentRequired: boolean;
  howToArrange: string;
  conditions: string;
  paymentInstructions: string;
  restrictions: string;
}

export const emptyViewingTermsForm: ViewingTermsFormState = {
  feeGhs: '',
  appointmentRequired: true,
  howToArrange: '',
  conditions: '',
  paymentInstructions: '',
  restrictions: '',
};

/** Pre-fill the editor from already-approved values (a change proposal). */
export const viewingTermsToForm = (
  feeGhs: number | null,
  terms: ViewingTermsValues | null
): ViewingTermsFormState => ({
  feeGhs: feeGhs === null ? '' : String(feeGhs),
  appointmentRequired: terms?.appointmentRequired ?? true,
  howToArrange: terms?.howToArrange ?? '',
  conditions: terms?.conditions ?? '',
  paymentInstructions: terms?.paymentInstructions ?? '',
  restrictions: terms?.restrictions ?? '',
});

export const viewingTermsPayload = (form: ViewingTermsFormState): ViewingTermsValues => ({
  appointmentRequired: form.appointmentRequired,
  howToArrange: form.howToArrange.trim(),
  conditions: form.conditions.trim(),
  paymentInstructions: form.paymentInstructions.trim(),
  restrictions: form.restrictions.trim(),
});

const inputClass =
  'w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]';

export const ViewingTermsFields: React.FC<{
  form: ViewingTermsFormState;
  onChange: (next: ViewingTermsFormState) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
}> = ({ form, onChange, errors, idPrefix = 'viewing' }) => {
  const fieldErrors: Record<string, string> = errors ?? {};
  const set = <K extends keyof ViewingTermsFormState>(key: K, value: ViewingTermsFormState[K]) =>
    onChange({ ...form, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3">
      <div className="flex items-start gap-2 text-[11px] text-slate-400">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#08D9D6]" />
        <span>
          This fee belongs to <strong className="text-white">this property only</strong>. It is not the rental
          commission and no commission percentage is applied to it. Nothing here is shown to tenants until Goodlucks
          staff approve the listing, and the fee is paid on site — never online.
        </span>
      </div>

      <div>
        <label htmlFor={id('fee')} className="block text-xs font-semibold text-slate-300 mb-1">
          Viewing fee for this property (GHS) <span className="text-[#FF8FA8]">*</span>
        </label>
        <input
          id={id('fee')}
          type="number"
          min="1"
          step="0.01"
          inputMode="decimal"
          value={form.feeGhs}
          onChange={(e) => set('feeGhs', e.target.value)}
          placeholder="e.g. 150"
          className={inputClass}
        />
        {fieldErrors.viewingFeeGhs && <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors.viewingFeeGhs}</p>}
      </div>

      <div>
        <label htmlFor={id('appointment')} className="block text-xs font-semibold text-slate-300 mb-1">
          Is an appointment required? <span className="text-[#FF8FA8]">*</span>
        </label>
        <select
          id={id('appointment')}
          value={form.appointmentRequired ? 'yes' : 'no'}
          onChange={(e) => set('appointmentRequired', e.target.value === 'yes')}
          className={inputClass}
        >
          <option value="yes">Yes — arrange a time first</option>
          <option value="no">No — tenants may call in without an appointment</option>
        </select>
        {fieldErrors['viewingTerms.appointmentRequired'] && (
          <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors['viewingTerms.appointmentRequired']}</p>
        )}
      </div>

      <div>
        <label htmlFor={id('how')} className="block text-xs font-semibold text-slate-300 mb-1">
          How to arrange the viewing <span className="text-[#FF8FA8]">*</span>
        </label>
        <textarea
          id={id('how')}
          rows={2}
          value={form.howToArrange}
          onChange={(e) => set('howToArrange', e.target.value)}
          placeholder="e.g. Message the agent through Goodlucks; the agent confirms a slot within one working day."
          className={inputClass}
        />
        {fieldErrors['viewingTerms.howToArrange'] && (
          <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors['viewingTerms.howToArrange']}</p>
        )}
      </div>

      <div>
        <label htmlFor={id('payment')} className="block text-xs font-semibold text-slate-300 mb-1">
          How the viewing fee is paid <span className="text-[#FF8FA8]">*</span>
        </label>
        <textarea
          id={id('payment')}
          rows={2}
          value={form.paymentInstructions}
          onChange={(e) => set('paymentInstructions', e.target.value)}
          placeholder="e.g. Paid in cash to the agent on site after the viewing. Goodlucks never asks for a viewing fee online."
          className={inputClass}
        />
        {fieldErrors['viewingTerms.paymentInstructions'] && (
          <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors['viewingTerms.paymentInstructions']}</p>
        )}
      </div>

      <div>
        <label htmlFor={id('conditions')} className="block text-xs font-semibold text-slate-300 mb-1">
          Conditions <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <textarea
          id={id('conditions')}
          rows={2}
          value={form.conditions}
          onChange={(e) => set('conditions', e.target.value)}
          placeholder="e.g. Bring a valid ID. The property is occupied, so access is by appointment."
          className={inputClass}
        />
        {fieldErrors['viewingTerms.conditions'] && (
          <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors['viewingTerms.conditions']}</p>
        )}
      </div>

      <div>
        <label htmlFor={id('restrictions')} className="block text-xs font-semibold text-slate-300 mb-1">
          Restrictions <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <textarea
          id={id('restrictions')}
          rows={2}
          value={form.restrictions}
          onChange={(e) => set('restrictions', e.target.value)}
          placeholder="e.g. No photography of the interior without the agent present."
          className={inputClass}
        />
        {fieldErrors['viewingTerms.restrictions'] && (
          <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors['viewingTerms.restrictions']}</p>
        )}
      </div>
    </div>
  );
};

export default ViewingTermsFields;

import React, { useEffect, useState } from 'react';
import { Check, Edit, FileText, Plus, Star } from 'lucide-react';
import { useCRM } from '../store';
import { FormatInvoice } from '../types';

const emptyInvoice: Omit<FormatInvoice, 'id'> = {
  companyName: '',
  addressess: '',
  addressess1: '',
  mobileNumber: '',
  customerCareNumber: '',
  customerCareEmail: '',
  webAddress: '',
  defaultSelection: false
};

export default function FormatInvoiceSettings() {
  const { formatInvoices, addFormatInvoice, updateFormatInvoice, setDefaultFormatInvoice } = useCRM();
  const [form, setForm] = useState(emptyInvoice);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const selected = formatInvoices.find(invoice => invoice.id === selectedId) || null;

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  const updateField = (field: keyof typeof emptyInvoice, value: string | boolean) => {
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyInvoice);
    setMessage('');
  };

  const startEdit = (invoice: FormatInvoice) => {
    setEditingId(invoice.id);
    setForm({ ...invoice });
    setSelectedId(invoice.id);
    setMessage('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.companyName.trim()) return;

    if (editingId) {
      await updateFormatInvoice(editingId, { ...form, companyName: form.companyName.trim() });
      if (form.defaultSelection) await setDefaultFormatInvoice(editingId);
      setMessage('Invoice format updated.');
    } else {
      await addFormatInvoice({ ...form, companyName: form.companyName.trim() });
      setMessage('Invoice format created.');
    }
    setEditingId(null);
    setForm(emptyInvoice);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" /> Invoice Format Configuration
          </h3>
          <p className="text-xs text-slate-400">Manage the company details shown on future invoices.</p>
        </div>
        <button type="button" onClick={startCreate} className="shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New Format
        </button>
      </div>

      {message && <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-xs text-emerald-400">{message}</div>}

      <form onSubmit={handleSubmit} className="bg-[#0d0d10] border border-slate-800 p-5 rounded-2xl text-left space-y-4">
        <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-400">{editingId ? 'Edit Invoice Format' : 'Create Invoice Format'}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([
            ['companyName', 'Company Name', true],
            ['addressess', 'Addressess', true],
            ['addressess1', 'Addressess-1', false],
            ['mobileNumber', 'Mobile Number', false],
            ['customerCareNumber', 'Customer Care Number', false],
            ['customerCareEmail', 'Customer Care Email', false],
            ['webAddress', 'Web Address', false]
          ] as const).map(([field, label, required]) => (
            <label key={field} className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {label}{required ? ' *' : ''}
              {field.startsWith('addressess') ? (
                <textarea required={required} value={form[field]} onChange={event => updateField(field, event.target.value)} rows={2} className="mt-1.5 w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
              ) : (
                <input required={required} type={field === 'customerCareEmail' ? 'email' : 'text'} value={form[field]} onChange={event => updateField(field, event.target.value)} className="mt-1.5 w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
              )}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={form.defaultSelection} onChange={event => updateField('defaultSelection', event.target.checked)} /> Set as default invoice format
        </label>
        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">{editingId ? 'Save Changes' : 'Save Format'}</button>
          {editingId && <button type="button" onClick={startCreate} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>}
        </div>
      </form>

      <div className="bg-[#0d0d10] border border-slate-800 rounded-2xl overflow-hidden">
        {formatInvoices.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">No invoice formats configured.</div> : (
          <table className="w-full text-left border-collapse text-xs">
            <thead><tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-wider"><th className="py-3 px-4">Company</th><th className="py-3 px-4">Contact</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-850">
              {formatInvoices.map(invoice => (
                <tr key={invoice.id} className="hover:bg-slate-900/30 text-slate-300">
                  <td className="py-3 px-4 font-bold text-slate-200">{invoice.companyName}</td>
                  <td className="py-3 px-4"><span className="block">{invoice.mobileNumber || 'No mobile number'}</span><span className="text-[10px] text-slate-500">{invoice.customerCareEmail || 'No care email'}</span></td>
                  <td className="py-3 px-4">{invoice.defaultSelection ? <span className="inline-flex items-center gap-1 text-amber-400 font-bold"><Star className="w-3 h-3 fill-current" /> Default</span> : <span className="text-slate-500">Available</span>}</td>
                  <td className="py-3 px-4"><div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setSelectedId(invoice.id)} className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-slate-300">View</button>
                    <button type="button" onClick={() => startEdit(invoice)} className="p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-300" title="Edit invoice format"><Edit className="w-3.5 h-3.5" /></button>
                    {!invoice.defaultSelection && <button type="button" onClick={() => setDefaultFormatInvoice(invoice.id)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-white">Set Default</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 space-y-1"><strong className="text-white">{selected.companyName}</strong><p>{selected.addressess}</p><p>{selected.addressess1}</p><p>{selected.mobileNumber} | {selected.webAddress}</p><p>{selected.customerCareNumber} | {selected.customerCareEmail}</p><Check className="w-4 h-4 text-emerald-400" /></div>}
    </div>
  );
}

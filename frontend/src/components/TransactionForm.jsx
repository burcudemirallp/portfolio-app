import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  createTransaction,
  updateTransaction,
  getInstruments, 
  getAccounts,
  createInstrument,
  createBroker,
  createAccount,
  getBrokers,
  getDebugTransactions
} from '../services/api';

function TransactionForm({ transaction, onClose, onSuccess }) {
  const { user } = useAuth();
  const isEditMode = !!transaction;
  const [step, setStep] = useState(1); // 1: Transaction, 2: Add Instrument, 3: Add Broker, 4: Add Account
  const [instruments, setInstruments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [secondaryTagInput, setSecondaryTagInput] = useState('');
  const [availablePrimaryTags, setAvailablePrimaryTags] = useState(['ABD', 'Altın', 'Fon', 'Osmanlı', 'TM Model Portföy']);
  const [availableSecondaryTags] = useState(['Temettü', 'Büyüme', 'Değer', 'Kısa Vade', 'Uzun Vade', 'Spekülatif']);
  
  // Load asset types and markets from localStorage
  const [assetTypes] = useState(() => {
    const saved = localStorage.getItem('assetTypes');
    return saved ? JSON.parse(saved) : ['Hisse', 'Fon', 'Altın', 'Gümüş', 'Nakit', 'Kripto'];
  });
  const [markets] = useState(() => {
    const saved = localStorage.getItem('markets');
    return saved ? JSON.parse(saved) : ['BIST', 'NYSE', 'NASDAQ', 'TEFAS', 'BEFAS', 'Emtia', 'Nakit', 'Banka', 'Binance'];
  });

  const [formData, setFormData] = useState(
    transaction ? {
      account_id: transaction.account_id,
      instrument_id: transaction.instrument_id,
      type: 'buy',
      quantity: transaction.quantity.toString(),
      price: transaction.price.toString(),
      fees: transaction.fees?.toString() || '0',
      currency: transaction.currency || 'TRY',
      horizon: transaction.horizon || 'long',
      primary_tag: transaction.primary_tag || '',
      secondary_tags: transaction.secondary_tags || '',
    } : {
      account_id: '',
      instrument_id: '',
      type: 'buy',
      quantity: '',
      price: '',
      fees: '0',
      currency: 'TRY',
      horizon: 'long',
      primary_tag: '',
      secondary_tags: '',
    }
  );

  const [newInstrument, setNewInstrument] = useState({
    symbol: '',
    name: '',
    asset_type: 'Hisse',
    market: 'BIST',
    currency: 'TRY',
  });

  const [newBroker, setNewBroker] = useState({ name: '' });
  
  const [newAccount, setNewAccount] = useState({
    name: '',
    base_currency: 'TRY',
    broker_id: '',
  });

  const loadData = async () => {
    try {
      const [instRes, accRes, brokerRes, txRes] = await Promise.all([
        getInstruments(),
        getAccounts(),
        getBrokers(),
        getDebugTransactions()
      ]);
      setInstruments(Array.isArray(instRes?.data) ? instRes.data : []);
      setAccounts(Array.isArray(accRes?.data) ? accRes.data : []);
      setBrokers(Array.isArray(brokerRes?.data) ? brokerRes.data : []);

      const txList = Array.isArray(txRes?.data) ? txRes.data : [];
      const existingPrimaryTags = [...new Set(
        txList.map(tx => tx.primary_tag).filter(Boolean)
      )];
      const defaultTags = ['ABD', 'Altın', 'Fon', 'Osmanlı', 'TM Model Portföy'];
      setAvailablePrimaryTags([...new Set([...defaultTags, ...existingPrimaryTags])]);
    } catch (err) {
      if (err.response?.status !== 401) console.error('Error loading data:', err);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        account_id: parseInt(formData.account_id),
        instrument_id: parseInt(formData.instrument_id),
        quantity: parseFloat(formData.quantity),
        price: parseFloat(formData.price),
        fees: parseFloat(formData.fees),
      };

      if (isEditMode) {
        await updateTransaction(transaction.id, payload);
      } else {
        await createTransaction(payload);
      }
      
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || (isEditMode ? 'İşlem güncellenirken hata oluştu' : 'İşlem eklenirken hata oluştu'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddInstrument = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createInstrument(newInstrument);
      await loadData();
      setFormData({ ...formData, instrument_id: res.data.id });
      setStep(1);
      setNewInstrument({ symbol: '', name: '', asset_type: 'Hisse', market: 'BIST', currency: 'TRY' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Enstrüman eklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBroker = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createBroker(newBroker);
      await loadData();
      setNewAccount({ ...newAccount, broker_id: res.data.id });
      setStep(4); // Go to add account
      setNewBroker({ name: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Broker eklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createAccount({
        ...newAccount,
        broker_id: parseInt(newAccount.broker_id)
      });
      await loadData();
      setFormData({ ...formData, account_id: res.data.id });
      setStep(1);
      setNewAccount({ name: '', base_currency: 'TRY', broker_id: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Hesap eklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bnc-surface border border-bnc-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-bnc-surface border-b border-bnc-border px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-bnc-textPri">
            {step === 1 && (isEditMode ? 'Alımı Düzenle' : 'Yeni Alım Ekle')}
            {step === 2 && 'Yeni Varlık Ekle'}
            {step === 3 && 'Yeni Broker Ekle'}
            {step === 4 && 'Yeni Hesap Ekle'}
          </h2>
          <button onClick={onClose} className="text-bnc-textTer hover:text-bnc-textPri">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 bg-bnc-red/10 border border-bnc-red/40 text-bnc-red px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Step 1: Transaction Form */}
          {step === 1 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Hesap</label>
                <div className="flex gap-2">
                  <select
                    value={formData.account_id}
                    onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                    className="flex-1 bnc-input"
                    required
                  >
                    <option value="">Hesap Seçin</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => brokers.length > 0 ? setStep(4) : setStep(3)}
                    className="bnc-btn-secondary px-4 py-2.5"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Enstrüman</label>
                <div className="flex gap-2">
                  <select
                    value={formData.instrument_id}
                    onChange={(e) => setFormData({ ...formData, instrument_id: e.target.value })}
                    className="flex-1 bnc-input"
                    required
                  >
                    <option value="">Enstrüman Seçin</option>
                    {instruments.map((inst) => (
                      <option key={inst.id} value={inst.id}>{inst.symbol} - {inst.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="bnc-btn-secondary px-4 py-2.5"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Yatırım Vadesi</label>
                <select
                  value={formData.horizon}
                  onChange={(e) => setFormData({ ...formData, horizon: e.target.value })}
                  className="w-full bnc-input"
                >
                  <option value="trade">Çok Kısa Vade (Trade)</option>
                  <option value="short">Kısa Vade (Short)</option>
                  <option value="mid">Orta Vade (Mid)</option>
                  <option value="long">Uzun Vade (Long)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-bnc-textSec mb-1">Miktar</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full bnc-input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bnc-textSec mb-1">Fiyat</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full bnc-input"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-bnc-textSec mb-1">Komisyon</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.fees}
                    onChange={(e) => setFormData({ ...formData, fees: e.target.value })}
                    className="w-full bnc-input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bnc-textSec mb-1">Para Birimi</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full bnc-input"
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              {/* Birincil Tag */}
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">
                  Birincil Tag <span className="text-bnc-textTer text-xs">(grafiklerde gösterilir)</span>
                </label>
                
                {/* Seçili Birincil Tag */}
                {formData.primary_tag && (
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1 bg-bnc-accent text-bnc-bg px-3 py-1 rounded-full text-sm font-medium">
                      {formData.primary_tag}
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, primary_tag: '' })}
                        className="hover:opacity-80"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                )}

                {/* Birincil Tag Seçim Butonları */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {availablePrimaryTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setFormData({ ...formData, primary_tag: tag })}
                      className={`px-3 py-1 rounded-full text-sm transition-colors ${
                        formData.primary_tag === tag
                          ? 'bg-bnc-accent text-bnc-bg font-medium'
                          : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* Yeni Birincil Tag Ekleme */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={secondaryTagInput}
                    onChange={(e) => setSecondaryTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (secondaryTagInput.trim()) {
                          setFormData({ ...formData, primary_tag: secondaryTagInput.trim() });
                          setSecondaryTagInput('');
                        }
                      }
                    }}
                    placeholder="Yeni birincil tag ekle..."
                    className="flex-1 bnc-input text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (secondaryTagInput.trim()) {
                        setFormData({ ...formData, primary_tag: secondaryTagInput.trim() });
                        setSecondaryTagInput('');
                      }
                    }}
                    className="bnc-btn-primary text-sm"
                  >
                    Ekle
                  </button>
                </div>
              </div>

              {/* İkincil Tag'ler */}
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">
                  İkincil Tag&apos;ler <span className="text-bnc-textTer text-xs">(sadece filtrelerde kullanılır, çoklu seçim)</span>
                </label>
                
                {/* Seçili İkincil Tag'ler */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.secondary_tags && formData.secondary_tags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 bg-bnc-surfaceAlt border border-bnc-border text-bnc-textPri px-3 py-1 rounded-full text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => {
                          const tags = formData.secondary_tags.split(',').map(t => t.trim()).filter(Boolean);
                          tags.splice(index, 1);
                          setFormData({ ...formData, secondary_tags: tags.join(', ') });
                        }}
                        className="hover:text-bnc-red"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* İkincil Tag Seçim Butonları */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {availableSecondaryTags.map(tag => {
                    const isSelected = formData.secondary_tags.split(',').map(t => t.trim()).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const currentTags = formData.secondary_tags.split(',').map(t => t.trim()).filter(Boolean);
                          if (isSelected) {
                            const newTags = currentTags.filter(t => t !== tag);
                            setFormData({ ...formData, secondary_tags: newTags.join(', ') });
                          } else {
                            currentTags.push(tag);
                            setFormData({ ...formData, secondary_tags: currentTags.join(', ') });
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-sm transition-colors ${
                          isSelected
                            ? 'bg-bnc-accent/20 text-bnc-accent border border-bnc-accent font-medium'
                            : 'bg-bnc-surfaceAlt text-bnc-textSec hover:bg-bnc-border'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                {/* Manuel İkincil Tag Ekleme */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={secondaryTagInput}
                    onChange={(e) => setSecondaryTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && secondaryTagInput.trim()) {
                        e.preventDefault();
                        const currentTags = formData.secondary_tags.split(',').map(t => t.trim()).filter(Boolean);
                        if (!currentTags.includes(secondaryTagInput.trim())) {
                          currentTags.push(secondaryTagInput.trim());
                          setFormData({ ...formData, secondary_tags: currentTags.join(', ') });
                        }
                        setSecondaryTagInput('');
                      }
                    }}
                    className="flex-1 bnc-input text-sm"
                    placeholder="Özel tag ekle (Enter'a bas)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (secondaryTagInput.trim()) {
                        const currentTags = formData.secondary_tags.split(',').map(t => t.trim()).filter(Boolean);
                        if (!currentTags.includes(secondaryTagInput.trim())) {
                          currentTags.push(secondaryTagInput.trim());
                          setFormData({ ...formData, secondary_tags: currentTags.join(', ') });
                        }
                        setSecondaryTagInput('');
                      }
                    }}
                    className="bnc-btn-secondary text-sm"
                  >
                    Ekle
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bnc-btn-secondary"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bnc-btn-primary disabled:opacity-50"
                >
                  {loading ? (isEditMode ? 'Güncelleniyor...' : 'Ekleniyor...') : (isEditMode ? 'Güncelle' : 'Ekle')}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Add Instrument */}
          {step === 2 && (
            <form onSubmit={handleAddInstrument} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Sembol</label>
                <input
                  type="text"
                  value={newInstrument.symbol}
                  onChange={(e) => setNewInstrument({ ...newInstrument, symbol: e.target.value.toUpperCase() })}
                  className="w-full bnc-input"
                  placeholder="THYAO"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">İsim</label>
                <input
                  type="text"
                  value={newInstrument.name}
                  onChange={(e) => setNewInstrument({ ...newInstrument, name: e.target.value })}
                  className="w-full bnc-input"
                  placeholder="Türk Hava Yolları"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-bnc-textSec mb-1">Tip</label>
                  <select
                    value={newInstrument.asset_type}
                    onChange={(e) => setNewInstrument({ ...newInstrument, asset_type: e.target.value })}
                    className="w-full bnc-input"
                  >
                    {assetTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-bnc-textSec mb-1">Piyasa</label>
                  <select
                    value={newInstrument.market}
                    onChange={(e) => setNewInstrument({ ...newInstrument, market: e.target.value })}
                    className="w-full bnc-input"
                  >
                    {markets.map(market => (
                      <option key={market} value={market}>{market}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-bnc-textSec mb-1">Para Birimi</label>
                  <select
                    value={newInstrument.currency}
                    onChange={(e) => setNewInstrument({ ...newInstrument, currency: e.target.value })}
                    className="w-full bnc-input"
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bnc-btn-secondary"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bnc-btn-primary disabled:opacity-50"
                >
                  {loading ? 'Ekleniyor...' : 'Ekle'}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Add Broker */}
          {step === 3 && (
            <form onSubmit={handleAddBroker} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Broker Adı</label>
                <input
                  type="text"
                  value={newBroker.name}
                  onChange={(e) => setNewBroker({ name: e.target.value })}
                  className="w-full bnc-input"
                  placeholder="Garanti BBVA"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bnc-btn-secondary"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bnc-btn-primary disabled:opacity-50"
                >
                  {loading ? 'Ekleniyor...' : 'Ekle ve Hesap Oluştur'}
                </button>
              </div>
            </form>
          )}

          {/* Step 4: Add Account */}
          {step === 4 && (
            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Hesap Adı</label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  className="w-full bnc-input"
                  placeholder="Ana Hesap"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Broker</label>
                <div className="flex gap-2">
                  <select
                    value={newAccount.broker_id}
                    onChange={(e) => setNewAccount({ ...newAccount, broker_id: e.target.value })}
                    className="flex-1 bnc-input"
                    required
                  >
                    <option value="">Broker Seçin</option>
                    {brokers.map((broker) => (
                      <option key={broker.id} value={broker.id}>{broker.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="bnc-btn-secondary px-4 py-2.5"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-bnc-textSec mb-1">Para Birimi</label>
                <select
                  value={newAccount.base_currency}
                  onChange={(e) => setNewAccount({ ...newAccount, base_currency: e.target.value })}
                  className="w-full bnc-input"
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bnc-btn-secondary"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bnc-btn-primary disabled:opacity-50"
                >
                  {loading ? 'Ekleniyor...' : 'Ekle'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default TransactionForm;

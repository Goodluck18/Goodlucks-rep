import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEOHead } from './SEOHead';
import { 
  Building2, 
  Upload, 
  X, 
  Sparkles, 
  CheckCircle2, 
  ShieldAlert, 
  MapPin, 
  Plus, 
  Image as ImageIcon,
  DollarSign,
  Bed,
  Bath,
  ArrowRight,
  Lock,
  AlertCircle
} from 'lucide-react';
import { api, messageForError } from '../services/apiService';

interface ListPropertyViewProps {
  onOpenAuth?: (mode?: 'login' | 'register', role?: 'tenant' | 'landlord') => void;
}

export const ListPropertyView: React.FC<ListPropertyViewProps> = ({ onOpenAuth }) => {
  const { currentUser, currentRole, addProperty, setCurrentView } = useApp();

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('Cantonments, Accra');
  const [city, setCity] = useState('Accra');
  const [rentGhs, setRentGhs] = useState(4500);
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(2);
  const [propertyType, setPropertyType] = useState<'Apartment' | 'Luxury Villa' | 'Townhouse' | 'Studio' | 'Duplex' | 'Penthouse' | 'Commercial'>('Apartment');
  const [description, setDescription] = useState('');
  const [availability, setAvailability] = useState('Available Now');
  const [images, setImages] = useState<string[]>([
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80'
  ]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    '24/7 Standby Generator',
    'Fitted Kitchen',
    'Air Conditioning',
    'Gated Security',
    'Water Tank Storage'
  ]);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

  const ALL_AMENITIES = [
    '24/7 Standby Generator', 'Swimming Pool', 'Fitted Kitchen', 
    'Air Conditioning', 'Gated Security', 'Balcony', 'Elevator', 
    'Gym & Spa', 'Underground Parking', 'Water Tank Storage',
    'Smart Home Controls', 'Staff Quarters', 'Electric Fence & CCTV'
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setFormError(null);
    const accepted: File[] = [];
    const candidates: File[] = Array.from(fileList as unknown as ArrayLike<File>);
    for (const file of candidates) {
      if (!file.type.startsWith('image/')) {
        setFormError(`"${file.name}" is not an image. Use JPG, PNG, WEBP or GIF.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setFormError(`"${file.name}" is larger than 8 MB.`);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) {
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      // Images are uploaded and stored on the server immediately; only the
      // returned URLs are kept (never base64 blobs in browser storage).
      const result = await api.uploadImages(accepted);
      setImages(prev => [...prev, ...result.urls]);
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const toggleAmenity = (amenity: string) => {
    if (selectedAmenities.includes(amenity)) {
      setSelectedAmenities(selectedAmenities.filter(a => a !== amenity));
    } else {
      setSelectedAmenities([...selectedAmenities, amenity]);
    }
  };

  const generateAiDescription = async () => {
    if (!title || !location) {
      alert("Please enter a Title and Location first.");
      return;
    }
    setGeneratingAi(true);
    setFormError(null);
    try {
      const data = await api.aiDescribe({
        title,
        location,
        propertyType,
        bedrooms,
        rentGhs,
        amenities: selectedAmenities,
      });
      if (data.description) {
        setDescription(data.description);
      }
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !location.trim()) {
      setFormError('Please add a property title and location.');
      return;
    }
    if (images.length === 0) {
      setFormError('Please upload at least one property image.');
      return;
    }
    if (isUploading) {
      setFormError('Please wait for the images to finish uploading.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addProperty({
        title: title.trim(),
        location: location.trim(),
        city,
        rentGhs,
        bedrooms,
        bathrooms,
        propertyType,
        images,
        description: description.trim() || `Modern ${propertyType} in ${location}. Managed via Goodlucks Homes.`,
        amenities: selectedAmenities,
        nearbyPlaces: [
          { name: 'City Center', type: 'Commercial Hub', distance: '5 mins' }
        ],
        availability,
      });
      setSubmitted(true);
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Landlord Auth Guard Check
  if (!currentUser || currentRole !== 'landlord') {
    return (
      <div className="min-h-[80vh] bg-[#252A34] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <SEOHead
          title="List Property for Rent - Landlord Portal | Goodlucks Homes Ghana"
          description="List your property with Goodlucks Homes Ghana. We coordinate tenant vetting, viewings, and tenancy agreements seamlessly."
        />
        <div className="max-w-xl w-full bg-slate-800/90 border border-white/10 rounded-3xl p-6 sm:p-10 text-center space-y-6 shadow-2xl animate-fadeIn">
          
          <div className="w-20 h-20 rounded-3xl bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/30 flex items-center justify-center mx-auto shadow-lg shadow-[#08D9D6]/10">
            <Building2 className="w-10 h-10" />
          </div>

          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20">
              <ShieldAlert className="w-3.5 h-3.5" />
              Landlord Login Required
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {!currentUser ? 'Log In to List Your Property' : 'Landlord Account Required'}
            </h1>
            
            <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              {!currentUser
                ? 'To ensure verified listings and safety for tenants across Ghana, you must log in or register as a Landlord on Goodlucks Homes to submit properties.'
                : `You are currently signed in as ${currentUser.name} (${currentUser.role.toUpperCase()} Account). Please switch to a Landlord account to list properties.`}
            </p>
          </div>

          {/* Value Props Card */}
          <div className="bg-slate-900/80 p-4 rounded-2xl border border-white/5 text-left text-xs space-y-2.5">
            <div className="text-xs font-bold text-[#08D9D6] uppercase tracking-wider">Why List with Goodlucks Homes?</div>
            <ul className="space-y-2 text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#08D9D6] shrink-0 mt-0.5" />
                <span><strong>Verified Intermediary Model:</strong> We schedule physical viewings and vet potential tenants for you.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#08D9D6] shrink-0 mt-0.5" />
                <span><strong>Zero Listing Fees:</strong> Submit your apartment, villa, or townhouse with no upfront charges.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#08D9D6] shrink-0 mt-0.5" />
                <span><strong>AI-Powered Matching:</strong> Connect instantly with active tenants searching in your suburb.</span>
              </li>
            </ul>
          </div>

          {/* Action CTAs */}
          <div className="space-y-3 pt-2">
            {!currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenAuth && onOpenAuth('login', 'landlord')}
                  className="w-full py-3.5 rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-xl shadow-[#08D9D6]/20 flex items-center justify-center gap-2 active:scale-98"
                >
                  <Lock className="w-4 h-4" />
                  <span>Log In as Landlord to List</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenAuth && onOpenAuth('login', 'landlord')}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 text-[#08D9D6] border border-[#08D9D6]/30 hover:bg-slate-800 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Existing Landlord Sign-In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenAuth && onOpenAuth('register', 'landlord')}
                    className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors"
                  >
                    Register New Account
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => onOpenAuth && onOpenAuth('login', 'landlord')}
                  className="flex-1 py-3 rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-lg"
                >
                  Switch to Landlord Account
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('home')}
                  className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors"
                >
                  Return to Home
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#252A34] text-white py-10 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="List Property for Rent - Landlord Portal | Goodlucks Homes Ghana"
        description="List your apartment or house with Goodlucks Homes Ghana. AI description generation, instant tenant matching, and hassle-free management."
      />
      <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20">
            <Building2 className="w-4 h-4" />
            Landlord Listing Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            List Your Property with Goodlucks Homes
          </h1>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            We handle tenant enquiries, schedule physical viewings, verify tenant background, and manage rental contracts. No direct hassle for landlords.
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-8">
            
            {/* Image Upload Section */}
            <div className="space-y-4 pb-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#08D9D6] flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Property Images Upload
                  </h2>
                  <p className="text-xs text-slate-400">Drag & drop or select real high-res images of your property</p>
                </div>
                <span className="text-xs text-slate-400 font-semibold">
                  {isUploading ? 'Uploading images…' : `${images.length} images selected`}
                </span>
              </div>

              {/* Upload Dropzone */}
              <div className="relative border-2 border-dashed border-white/20 hover:border-[#08D9D6] rounded-2xl p-6 text-center bg-slate-900/50 transition-colors">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-semibold text-white">
                    Click to Upload or Drag Images Here
                  </div>
                  <div className="text-xs text-slate-400">
                    Supports JPG, PNG, WEBP or GIF (max 8MB per file)
                  </div>
                </div>
              </div>

              {/* Image Previews */}
              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative aspect-[4/3] rounded-xl overflow-hidden group border border-white/10">
                      <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-[#FF2E63] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Basic Property Specs */}
            <div className="space-y-4 pb-6 border-b border-white/10">
              <h2 className="text-lg font-bold text-[#08D9D6]">Basic Property Details</h2>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Property Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cantonments Executive 3-Bedroom Luxury Apartment"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Location / Suburb
                  </label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Cantonments, East Legon"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Accra or Kumasi"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Monthly Rent (GHS)
                  </label>
                  <input
                    type="number"
                    required
                    step={100}
                    value={rentGhs}
                    onChange={(e) => setRentGhs(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Bedrooms
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Bathrooms
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Property Type
                  </label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value as any)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Luxury Villa">Luxury Villa</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Studio">Studio</option>
                    <option value="Duplex">Duplex</option>
                    <option value="Penthouse">Penthouse</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Description & AI Generator */}
            <div className="space-y-3 pb-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  Property Description
                </label>
                <button
                  type="button"
                  onClick={generateAiDescription}
                  disabled={generatingAi}
                  className="px-3 py-1 rounded-lg bg-[#08D9D6]/20 text-[#08D9D6] hover:bg-[#08D9D6]/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {generatingAi ? 'Generating Description...' : 'Generate with AI'}
                </button>
              </div>

              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your property amenities, security, backup generator, water storage..."
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
              />
            </div>

            {/* Amenities Select */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Select Amenities & Features
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_AMENITIES.map(amenity => {
                  const isChecked = selectedAmenities.includes(amenity);
                  return (
                    <button
                      key={amenity}
                      type="button"
                      onClick={() => toggleAmenity(amenity)}
                      className={`p-2.5 rounded-xl text-xs text-left font-medium transition-all ${
                        isChecked
                          ? 'bg-[#08D9D6]/20 text-[#08D9D6] border border-[#08D9D6]/40 font-semibold'
                          : 'bg-slate-900 text-slate-400 border border-white/5 hover:border-white/20'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}{amenity}
                    </button>
                  );
                })}
              </div>
            </div>

            {formError && (
              <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="w-full py-4 rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-base hover:bg-[#08D9D6]/90 transition-all shadow-xl shadow-[#08D9D6]/20 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-[#252A34]/30 border-t-[#252A34] rounded-full animate-spin" />
                  <span>Submitting Listing...</span>
                </>
              ) : (
                <>
                  <span>Submit Property for Approval</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

          </form>
        ) : (
          <div className="bg-slate-800/90 border border-[#08D9D6]/40 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-[#08D9D6]/20 text-[#08D9D6] border border-[#08D9D6]/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Property Submitted for Review!
              </h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                Your listing <span className="text-white font-semibold">{title}</span> has been logged into the Goodlucks Homes Admin Queue for approval.
              </p>
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl text-xs text-left max-w-md mx-auto space-y-2 border border-white/10">
              <div className="text-[#08D9D6] font-bold uppercase tracking-wider">Status: Pending Approval</div>
              <p className="text-slate-300">
                Goodlucks Homes agents perform a document and safety check before listing your property live. You can track status in your Landlord Dashboard.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setCurrentView('dashboard')}
                className="px-6 py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-bold text-sm shadow-md"
              >
                Go to Landlord Dashboard
              </button>
              <button
                onClick={() => setSubmitted(false)}
                className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm"
              >
                Add Another Property
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

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
        description: description.trim() || `Modern ${propertyType} in ${location}. Listed through Goodlucks Homes.`,
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
      <div className="min-h-[80vh] bg-surface text-ink py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <SEOHead
          title="List Property for Rent - Landlord Portal | Goodlucks Homes Ghana"
          description="List your property with Goodlucks Homes Ghana. Landlords and agents submit listings, our team reviews them before publishing, and viewing requests are arranged through the platform."
        />
        <div className="max-w-xl w-full bg-surface border border-line rounded-2xl p-6 sm:p-10 text-center space-y-6 shadow-lg animate-fadeIn">
          
          <div className="w-20 h-20 rounded-2xl bg-interactive/10 text-ink border border-interactive/30 flex items-center justify-center mx-auto shadow-lg shadow-ink/5">
            <Building2 className="w-10 h-10" />
          </div>

          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-interactive/10 text-ink text-xs font-bold border border-interactive/20">
              <ShieldAlert className="w-3.5 h-3.5" />
              Landlord Login Required
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {!currentUser ? 'Log In to List Your Property' : 'Landlord Account Required'}
            </h1>
            
            <p className="text-sm text-ink/70 leading-relaxed max-w-md mx-auto">
              {!currentUser
                ? 'To keep every listing reviewed before it appears, you must log in or register as a Landlord on Goodlucks Homes to submit properties.'
                : `You are currently signed in as ${currentUser.name} (${currentUser.role.toUpperCase()} Account). Please switch to a Landlord account to list properties.`}
            </p>
          </div>

          {/* Value Props Card */}
          <div className="bg-surface p-4 rounded-2xl border border-line text-left text-xs space-y-2.5">
            <div className="text-xs font-bold text-ink uppercase tracking-wider">Why List with Goodlucks Homes?</div>
            <ul className="space-y-2 text-ink/70">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-ink shrink-0 mt-0.5" />
                <span><strong>Viewing requests only:</strong> tenants ask through Goodlucks Homes and you agree the time with them directly.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-ink shrink-0 mt-0.5" />
                <span><strong>Zero Listing Fees:</strong> Submit your apartment, villa, or townhouse with no upfront charges.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-ink shrink-0 mt-0.5" />
                <span><strong>Matched to tenant requests:</strong> your listing is suggested to tenants whose area, budget and bedrooms fit.</span>
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
                  className="gl-btn gl-btn-primary w-full py-3.5 text-sm flex active:scale-98"
                >
                  <Lock className="w-4 h-4" />
                  <span>Log In as Landlord to List</span>
                </button>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenAuth && onOpenAuth('login', 'landlord')}
                    className="flex-1 py-2.5 rounded-xl bg-surface text-ink border border-interactive/30 hover:bg-surface font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Existing Landlord Sign-In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenAuth && onOpenAuth('register', 'landlord')}
                    className="flex-1 py-2.5 rounded-xl bg-page hover:bg-line text-ink font-semibold text-xs transition-colors"
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
                  className="gl-btn gl-btn-primary flex-1 py-3 text-sm"
                >
                  Switch to Landlord Account
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('home')}
                  className="px-5 py-3 rounded-2xl bg-page hover:bg-line text-ink font-semibold text-sm transition-colors"
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
    <div className="min-h-screen bg-page text-ink py-10 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="List Property for Rent - Landlord Portal | Goodlucks Homes Ghana"
        description="List your apartment or house with Goodlucks Homes Ghana. Describe the property, submit it for review and receive viewing requests from tenants in Greater Accra."
      />
      <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-interactive/10 text-ink text-xs font-bold border border-interactive/20">
            <Building2 className="w-4 h-4" />
            Landlord Listing Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
            List Your Property with Goodlucks Homes
          </h1>
          <p className="text-sm text-ink/70 max-w-xl mx-auto leading-relaxed">
            Submit your listing, and viewing requests come to you through the platform. You keep control of your tenancy agreement and deal directly with your tenant.
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-2xl p-6 sm:p-8 shadow-lg space-y-8">
            
            {/* Image Upload Section */}
            <div className="space-y-4 pb-6 border-b border-line">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Property Images Upload
                  </h2>
                  <p className="text-xs text-ink/70">Drag & drop or select real high-res images of your property</p>
                </div>
                <span className="text-xs text-ink/70 font-semibold">
                  {isUploading ? 'Uploading images…' : `${images.length} images selected`}
                </span>
              </div>

              {/* Upload Dropzone */}
              <div className="relative border-2 border-dashed border-line hover:border-interactive rounded-2xl p-6 text-center bg-surface transition-colors">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-interactive/10 text-ink flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-semibold text-ink">
                    Click to Upload or Drag Images Here
                  </div>
                  <div className="text-xs text-ink/70">
                    Supports JPG, PNG, WEBP or GIF (max 8MB per file)
                  </div>
                </div>
              </div>

              {/* Image Previews */}
              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative aspect-[4/3] rounded-xl overflow-hidden group border border-line">
                      <img src={img} alt={`Preview ${idx}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-surface/95 text-ink shadow-sm hover:bg-accent hover:text-white transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Basic Property Specs */}
            <div className="space-y-4 pb-6 border-b border-line">
              <h2 className="text-lg font-bold text-ink">Basic Property Details</h2>

              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                  Property Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cantonments Executive 3-Bedroom Luxury Apartment"
                  className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Location / Suburb
                  </label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Cantonments, East Legon"
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Accra or Kumasi"
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Monthly Rent (GHS)
                  </label>
                  <input
                    type="number"
                    required
                    step={100}
                    value={rentGhs}
                    onChange={(e) => setRentGhs(Number(e.target.value))}
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Bedrooms
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(Number(e.target.value))}
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Bathrooms
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(Number(e.target.value))}
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Property Type
                  </label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value as any)}
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
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
            <div className="space-y-3 pb-6 border-b border-line">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-ink/70">
                  Property Description
                </label>
                <button
                  type="button"
                  onClick={generateAiDescription}
                  disabled={generatingAi}
                  className="px-3 py-1 rounded-lg bg-interactive/20 text-ink hover:bg-interactive/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
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
                className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
              />
            </div>

            {/* Amenities Select */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-ink/70">
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
                          ? 'bg-interactive/20 text-ink border border-interactive/40 font-semibold'
                          : 'bg-surface text-ink/70 border border-line hover:border-line'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}{amenity}
                    </button>
                  );
                })}
              </div>
            </div>

            {formError && (
              <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="gl-btn gl-btn-primary w-full"
            >
              {isSubmitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
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
          <div className="bg-surface border border-interactive/40 rounded-2xl p-8 text-center space-y-6 shadow-lg">
            <div className="w-20 h-20 rounded-full bg-interactive/20 text-ink border border-interactive/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-ink">
                Property Submitted for Review!
              </h2>
              <p className="text-sm text-ink/70 max-w-md mx-auto leading-relaxed">
                Your listing <span className="text-ink font-semibold">{title}</span> has been logged into the Goodlucks Homes Admin Queue for approval.
              </p>
            </div>

            <div className="bg-surface p-5 rounded-2xl text-xs text-left max-w-md mx-auto space-y-2 border border-line">
              <div className="text-ink font-bold uppercase tracking-wider">Status: Pending Approval</div>
              <p className="text-ink/70">
                A member of our team reviews the listing details before it goes live. For a landlord listing the viewing fee is the standard fee set by Goodlucks Homes; on an agent listing, the agent sets it. You can track the status on your dashboard.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setCurrentView('dashboard')}
                className="gl-btn gl-btn-primary px-6 py-3 text-sm"
              >
                Go to your dashboard
              </button>
              <button
                onClick={() => setSubmitted(false)}
                className="px-6 py-3 rounded-xl bg-page text-ink font-semibold text-sm"
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

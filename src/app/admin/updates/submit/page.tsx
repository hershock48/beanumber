'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import Link from 'next/link';

export default function SubmitUpdatePage() {
  const [formData, setFormData] = useState({
    sponsorCode: '',
    updateType: 'Progress Report',
    title: '',
    content: '',
    photos: [] as File[],
    submittedBy: '',
    adminPassword: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFormData({
        ...formData,
        photos: Array.from(e.target.files),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('sponsorCode', formData.sponsorCode);
      formDataToSend.append('updateType', formData.updateType);
      formDataToSend.append('title', formData.title);
      formDataToSend.append('content', formData.content);
      formDataToSend.append('submittedBy', formData.submittedBy);
      
      formData.photos.forEach((photo) => {
        formDataToSend.append('photos', photo);
      });

      // Add admin password to form data for authentication
      formDataToSend.append('adminPassword', formData.adminPassword);

      const response = await fetch('/api/admin/updates/submit', {
        method: 'POST',
        body: formDataToSend,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit update');
      }

      setSuccess(true);
      setFormData({
        sponsorCode: '',
        updateType: 'Progress Report',
        title: '',
        content: '',
        photos: [],
        submittedBy: '',
        adminPassword: '',
      });
      
      // Reset file input
      const fileInput = document.getElementById('photos') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      setError(err.message || 'Failed to submit update');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-8 w-8 text-gray-900" />
            <span className="text-xl font-semibold text-gray-900">Be A Number</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Submit Child Update</h1>
          <p className="text-gray-600 mb-8">
            Field team form to submit updates about sponsored children
          </p>

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md mb-6">
              Update submitted successfully! It will be reviewed and published.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="sponsorCode" className="block text-sm font-medium text-gray-700 mb-2">
                Sponsor Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="sponsorCode"
                value={formData.sponsorCode}
                onChange={(e) => setFormData({ ...formData, sponsorCode: e.target.value.toUpperCase() })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono"
                placeholder="BAN-2025-001"
              />
            </div>

            <div>
              <label htmlFor="updateType" className="block text-sm font-medium text-gray-700 mb-2">
                Update Type <span className="text-red-500">*</span>
              </label>
              <select
                id="updateType"
                value={formData.updateType}
                onChange={(e) => setFormData({ ...formData, updateType: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="Progress Report">Progress Report</option>
                <option value="Photo Update">Photo Update</option>
                <option value="Special Note">Special Note</option>
                <option value="Education Update">Education Update</option>
                <option value="Health Update">Health Update</option>
              </select>
            </div>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="e.g., Progress in School"
              />
            </div>

            <div>
              <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                Update Content <span className="text-red-500">*</span>
              </label>
              <textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                required
                rows={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Write the update content here..."
              />
            </div>

            <div>
              <label htmlFor="photos" className="block text-sm font-medium text-gray-700 mb-2">
                Photos (optional, multiple allowed)
              </label>
              <input
                type="file"
                id="photos"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              {formData.photos.length > 0 && (
                <p className="mt-2 text-sm text-gray-600">
                  {formData.photos.length} photo(s) selected
                </p>
              )}
            </div>

            <div>
              <label htmlFor="submittedBy" className="block text-sm font-medium text-gray-700 mb-2">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="submittedBy"
                value={formData.submittedBy}
                onChange={(e) => setFormData({ ...formData, submittedBy: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Field team member name"
              />
            </div>

            <div>
              <label htmlFor="adminPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Admin Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                id="adminPassword"
                value={formData.adminPassword}
                onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                placeholder="Enter admin password"
              />
              <p className="mt-1 text-sm text-gray-500">
                Required for authentication
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Update'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

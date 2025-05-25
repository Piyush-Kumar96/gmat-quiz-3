import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importPDF } from '../services/api';

export const ImportPage: React.FC = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<'questions' | 'answers' | 'mixed'>('mixed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF file');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await importPDF(file, type);
      setSuccess(`Successfully imported ${result.count} items`);
      setFile(null);
    } catch (err) {
      setError('Failed to import PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Import Questions</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="label">PDF Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'questions' | 'answers' | 'mixed')}
              className="input"
            >
              <option value="mixed">Mixed (Questions & Answers)</option>
              <option value="questions">Questions Only</option>
              <option value="answers">Answers Only</option>
            </select>
          </div>

          <div>
            <label className="label">Select PDF File</label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="input"
            />
          </div>

          {error && (
            <div className="text-red-500 p-4 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="text-green-500 p-4 bg-green-50 rounded-md">
              {success}
            </div>
          )}

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading || !file}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Importing...' : 'Import PDF'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn btn-secondary"
            >
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}; 
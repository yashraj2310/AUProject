import React from 'react';
import { Button } from './component';

export default function AIFeedbackModal({ show, feedback, isLoading, onClose }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-lg p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
          AI Feedback
        </h2>
        <div className="h-64 overflow-y-auto p-3 bg-gray-100 dark:bg-gray-700 rounded">
          {isLoading ? (
            <p className="text-gray-600 dark:text-gray-300">Generating suggestions…</p>
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
              {feedback}
            </pre>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose} content="Close" />
        </div>
      </div>
    </div>
  );
}

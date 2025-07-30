import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        // Table styling
        table: ({ children, ...props }) => (
          <div className="overflow-x-auto my-4">
            <table 
              className="min-w-full border-collapse border border-gray-300 text-sm"
              {...props}
            >
              {children}
            </table>
          </div>
        ),
        thead: ({ children, ...props }) => (
          <thead className="bg-gray-50" {...props}>
            {children}
          </thead>
        ),
        th: ({ children, ...props }) => (
          <th 
            className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-900"
            {...props}
          >
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td 
            className="border border-gray-300 px-3 py-2 text-gray-700"
            {...props}
          >
            {children}
          </td>
        ),
        tbody: ({ children, ...props }) => (
          <tbody className="bg-white" {...props}>
            {children}
          </tbody>
        ),
        // Enhanced text styling
        h1: ({ children, ...props }) => (
          <h1 className="text-lg font-bold text-gray-900 mb-2" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="text-base font-bold text-gray-900 mb-2" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="text-sm font-bold text-gray-900 mb-1" {...props}>
            {children}
          </h3>
        ),
        p: ({ children, ...props }) => (
          <p className="text-sm text-gray-700 mb-2" {...props}>
            {children}
          </p>
        ),
        ul: ({ children, ...props }) => (
          <ul className="list-disc list-inside text-sm text-gray-700 mb-2 space-y-1" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol className="list-decimal list-inside text-sm text-gray-700 mb-2 space-y-1" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="text-sm" {...props}>
            {children}
          </li>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-semibold text-gray-900" {...props}>
            {children}
          </strong>
        ),
        em: ({ children, ...props }) => (
          <em className="italic text-gray-700" {...props}>
            {children}
          </em>
        ),
        code: ({ children, ...props }) => (
          <code 
            className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono" 
            {...props}
          >
            {children}
          </code>
        ),
        pre: ({ children, ...props }) => (
          <pre 
            className="bg-gray-100 text-gray-800 p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2" 
            {...props}
          >
            {children}
          </pre>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote 
            className="border-l-4 border-gray-300 pl-4 italic text-gray-600 mb-2" 
            {...props}
          >
            {children}
          </blockquote>
        ),
        hr: ({ ...props }) => (
          <hr className="border-gray-300 my-4" {...props} />
        ),
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
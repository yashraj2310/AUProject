import React, { useState, useEffect } from 'react';
import { fetchLesson } from '../services/Problem.service';
import { Link } from 'react-router-dom';

export default function Microlesson({ problemId }) {
  const [lesson, setLesson] = useState(null);
 useEffect(() => {
   fetchLesson(problemId)
     .then(res => {
       const body = res.data;
       if (body?.statusCode === 200 && body.data) {
         setLesson(body.data);
       }
     })
     .catch(() => {});
 }, [problemId]);

  if (!lesson) return null;

  return (
    <div className="bg-gray-800 p-4 rounded mt-6">
      <h2 className="text-xl font-semibold">🔍 Microlesson: {lesson.pattern}</h2>
      <p className="mt-2 whitespace-pre-wrap">{lesson.summary}</p>
      {lesson.recommendations.length > 0 && (
        <div className="mt-4">
          <strong>Practice more:</strong>
          <ul className="list-disc pl-5 mt-1">
            {lesson.recommendations.map(r => (
              <li key={r.problemId}>
                <Link to={`/problems/${r.problemId}`} className="text-blue-400 hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

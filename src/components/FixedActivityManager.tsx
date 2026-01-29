'use client';

import { useState } from 'react';

export type FixedActivity = {
  id: string;
  day: string;
  activity: string;
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  activities: FixedActivity[];
  onChange: (activities: FixedActivity[]) => void;
}

export default function FixedActivityManager({ activities, onChange }: Props) {
  const [selectedDay, setSelectedDay] = useState('Mon');
  const [activityName, setActivityName] = useState('');

  const handleAdd = () => {
    if (!activityName.trim()) return;
    
    const newActivity: FixedActivity = {
      id: Math.random().toString(36).substr(2, 9),
      day: selectedDay,
      activity: activityName.trim(),
    };

    onChange([...activities, newActivity]);
    setActivityName(''); // Reset input
  };

  const handleRemove = (id: string) => {
    onChange(activities.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Input Area */}
      <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center bg-zinc-900 p-3 rounded-xl border border-zinc-800">
        <div className="flex-1 w-full">
          <label className="text-xs text-zinc-500 ml-1 mb-1 block">Activity Name</label>
          <input
            type="text"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            placeholder="e.g. Basketball, Pilates..."
            className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-white outline-none"
          />
        </div>
        
        <div className="w-full sm:w-auto">
          <label className="text-xs text-zinc-500 ml-1 mb-1 block">Day</label>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-white outline-none"
          >
            {DOW.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!activityName}
          className="w-full sm:w-auto bg-white text-black font-medium text-sm px-4 py-2 rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition"
        >
          Add
        </button>
      </div>

      {/* List Area */}
      {activities.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {activities.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded uppercase">{item.day}</span>
                <span className="text-sm text-zinc-200">{item.activity}</span>
              </div>
              <button
                onClick={() => handleRemove(item.id)}
                className="text-zinc-500 hover:text-red-400 p-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 italic text-center py-2">
          No fixed activities added yet.
        </p>
      )}
    </div>
  );
}
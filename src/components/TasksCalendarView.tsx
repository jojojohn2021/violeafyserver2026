import React, { useState } from 'react';
import { useCRM } from '../store';
import { Task, CalendarEvent } from '../types';
import { 
  CheckSquare, Calendar, RefreshCw, Plus, Trash2, ArrowUpRight, 
  Clock, AlertCircle, FileText, Check, Tag, UserPlus 
} from 'lucide-react';

export default function TasksCalendarView() {
  const { 
    hasAccess, tasks, addTask, updateTask, deleteTask, 
    calendarEvents, addCalendarEvent, deleteCalendarEvent, lastSyncedAt, syncingIndicator 
  } = useCRM();

  // Tasks Tab vs Calendar view
  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar'>('tasks');

  // Input states for Add Task Form
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('2026-06-12');
  const [taskPriority, setTaskPriority] = useState<'Low' | 'Medium' | 'High'>('High');
  const [taskCategory, setTaskCategory] = useState<'Call' | 'Email' | 'Meeting' | 'Demo' | 'Task'>('Task');
  const [taskAssignee, setTaskAssignee] = useState('Tony Stark');

  // Input states for Calendar Event Form
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStart, setEventStart] = useState('2026-06-10T10:00:00');
  const [eventEnd, setEventEnd] = useState('2026-06-10T11:30:00');
  const [eventType, setEventType] = useState<'Meeting' | 'Demo' | 'FollowUp' | 'CampaignRun'>('Meeting');

  // Local sync alert notification demo state
  const [showSyncSuccessNotification, setShowSyncSuccessNotification] = useState(false);

  // June 2026 Calendar Grid calculations
  // June 1 2026 is a Monday. June has 30 days.
  const juneDaysCount = 30;
  const startDayPadding = 1; // 1 means Monday in 0-indexed where Sun=0, so Mon starts on index 1

  if (!hasAccess('Tasks & Calendar', 'read')) {
    return (
      <div className="bg-rose-955/40 border border-[#4c1d24]/60 rounded-2xl p-8 text-center text-rose-205" id="access-denied-calendar">
        <h3 className="font-bold text-lg mb-2 text-white">Security Authorization Required</h3>
        <p className="text-sm opacity-90">Your active role profile does not have clearance to read team events. Shift perspective to managers to read schedule grids.</p>
      </div>
    );
  }

  // Handle task actions
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAccess('Tasks & Calendar', 'create')) return;

    if (!taskTitle) {
      alert('Task title is mandatory.');
      return;
    }

    addTask({
      title: taskTitle,
      description: taskDesc,
      dueDate: taskDueDate,
      priority: taskPriority,
      category: taskCategory,
      assignedTo: taskAssignee
    });

    setTaskTitle('');
    setTaskDesc('');
    setIsAddingTask(false);

    // Trigger sync animation feedback
    setShowSyncSuccessNotification(true);
    setTimeout(() => setShowSyncSuccessNotification(false), 2400);
  };

  const handleToggleTaskStatus = (id: string, currentStatus: Task['status']) => {
    const next = currentStatus === 'Pending' ? 'Completed' : 'Pending';
    updateTask(id, { status: next });
  };

  // Handle Event deletion
  const handleDeleteEvent = (id: string) => {
    if (!hasAccess('Tasks & Calendar', 'delete')) return;
    deleteCalendarEvent(id);
  };

  // Handle Calendar Event addition
  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAccess('Tasks & Calendar', 'create')) return;

    if (!eventTitle) return;

    const colors = {
      Meeting: 'bg-emerald-605',
      Demo: 'bg-indigo-605',
      FollowUp: 'bg-sky-605',
      CampaignRun: 'bg-amber-605',
    };

    addCalendarEvent({
      title: eventTitle,
      description: eventDesc,
      start: eventStart,
      end: eventEnd,
      type: eventType,
      color: colors[eventType]
    });

    setEventTitle('');
    setEventDesc('');
    setIsAddingEvent(false);

    // Trigger sync animation feedback
    setShowSyncSuccessNotification(true);
    setTimeout(() => setShowSyncSuccessNotification(false), 2400);
  };

  // Filter Tasks
  const pendingTasks = tasks.filter(t => t.status === 'Pending');
  const completedTasks = tasks.filter(t => t.status === 'Completed');
  return (
    <div className="space-y-6" id="tasks-calendar-container">
      {/* Upper bar with Switch and alert */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5.5 h-5.5 text-indigo-400" />
            Active Schedules & Real-Time Sync Nodes
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Synchronize customer task lists and team meetings instantly across all devices
          </p>
        </div>

        {/* Sync Status Banner */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-emerald-950/40 text-emerald-300 px-3.5 py-1.5 rounded-xl border border-emerald-900/30 text-xs">
          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Real-Time Sync: <span className="font-bold text-white">Active & Encrypted</span></span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping invisible md:inline-block" />
        </div>
      </div>

      {/* Sync visual notification banner */}
      {showSyncSuccessNotification && (
        <div className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-lg border border-indigo-750 flex items-center justify-between animate-fadeIn text-xs font-semibold" id="sync-notification-banner">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Success: Event properties written to master. Propagation completed to other sessions ({lastSyncedAt})</span>
          </div>
          <button onClick={() => setShowSyncSuccessNotification(false)} className="text-indigo-200 hover:text-white cursor-pointer select-none">
            ✕
          </button>
        </div>
      )}

      {/* Main Switching Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-[#141418] border border-slate-800 rounded-2xl p-2.5 gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'tasks' 
                ? 'bg-[#0d0d10] border border-indigo-500/50 text-indigo-400 shadow-lg' 
                : 'bg-[#0b0b0d] border border-slate-850 hover:border-slate-800 text-slate-405 hover:bg-slate-900'
            }`}
            id="tab-btn-tasks"
          >
            <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
            Outbound Checklists ({pendingTasks.length})
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'calendar' 
                ? 'bg-[#0d0d10] border border-indigo-500/50 text-indigo-400 shadow-lg' 
                : 'bg-[#0b0b0d] border border-slate-850 hover:border-slate-800 text-slate-405 hover:bg-slate-900'
            }`}
            id="tab-btn-calendar"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            June 2026 Calendar Grid ({calendarEvents.length})
          </button>
        </div>

        {activeTab === 'tasks' ? (
          hasAccess('Tasks & Calendar', 'create') && (
            <button 
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="px-3.5 py-1.5 bg-indigo-950/40 border border-indigo-900/50 text-indigo-305 rounded-xl text-xs font-bold hover:bg-indigo-900/30 cursor-pointer transition"
              id="sub-task-add-btn"
            >
              {isAddingTask ? 'Display Checklist' : '+ New Task'}
            </button>
          )
        ) : (
          hasAccess('Tasks & Calendar', 'create') && (
            <button 
              onClick={() => setIsAddingEvent(!isAddingEvent)}
              className="px-3.5 py-1.5 bg-indigo-950/40 border border-indigo-900/50 text-indigo-305 rounded-xl text-xs font-bold hover:bg-indigo-900/30 cursor-pointer transition"
              id="sub-event-add-btn"
            >
              {isAddingEvent ? 'Display Calendar' : '+ Schedule Event'}
            </button>
          )
        )}
      </div>

      {/* Conditionally rendering Tasks tab active */}
      {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left panel: New task form collapsible (5 Columns) */}
          {isAddingTask && (
            <div className="bg-[#141418] border border-slate-800 rounded-2xl p-5 shadow-sm lg:col-span-4 animate-fadeIn">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 mb-3">
                Create SFA Task
              </h3>
              <form onSubmit={handleCreateTask} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-405 mb-1">TASK DIRECTIVE:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Draft proposals" 
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:border-indigo-505"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-405 mb-1">DETAILED SCOPE:</label>
                  <textarea 
                    placeholder="Define critical deliverables here..." 
                    value={taskDesc}
                    onChange={e => setTaskDesc(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:border-indigo-505"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-405 mb-1">DEADLINE:</label>
                    <input 
                      type="date" 
                      value={taskDueDate} 
                      onChange={e => setTaskDueDate(e.target.value)}
                      className="w-full text-xs p-1.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-405 mb-1">URGENCY:</label>
                    <select 
                      value={taskPriority} 
                      onChange={e => setTaskPriority(e.target.value as any)}
                      className="w-full text-xs p-1.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg cursor-pointer font-bold"
                    >
                      <option value="High" className="bg-[#0f0f12]">🔴 High Priority</option>
                      <option value="Medium" className="bg-[#0f0f12]">🟡 Medium Priority</option>
                      <option value="Low" className="bg-[#0f0f12]">🟢 Low Priority</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-405 mb-1">CATEGORY:</label>
                    <select 
                      value={taskCategory} 
                      onChange={e => setTaskCategory(e.target.value as any)}
                      className="w-full text-xs p-1.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg cursor-pointer"
                    >
                      <option value="Task" className="bg-[#0f0f12]">General Task</option>
                      <option value="Call" className="bg-[#0f0f12]">Call</option>
                      <option value="Meeting" className="bg-[#0f0f12]">Meeting</option>
                      <option value="Demo" className="bg-[#0f0f12]">Demo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-405 mb-1">RESPONSIBLE AGENT:</label>
                    <select 
                      value={taskAssignee} 
                      onChange={e => setTaskAssignee(e.target.value)}
                      className="w-full text-xs p-1.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg cursor-pointer"
                    >
                      <option value="Tony Stark" className="bg-[#0f0f12]">Tony Stark (SFA Rep)</option>
                      <option value="Natasha Romanoff" className="bg-[#0f0f12]">Natasha Romanoff (SFA Rep)</option>
                      <option value="Bruce Banner" className="bg-[#0f0f12]">Bruce Banner (Marketing)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                  style={{ display: 'block' }}
                >
                  Schedule & Replicate
                </button>
              </form>
            </div>
          )}

          {/* Right panel: Active list of items */}
          <div className={`space-y-4 ${isAddingTask ? 'lg:col-span-8' : 'lg:col-span-12'}`} id="active-tasks-list">
            <div className="bg-[#141418] border border-slate-800 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3.5 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-emerald-400" />
                Durable Checklists Pending Actions ({pendingTasks.length})
              </h3>

              <div className="divide-y divide-slate-800/80">
                {pendingTasks.length === 0 ? (
                  <p className="text-xs text-slate-450 italic text-center py-8">
                    All assigned activities completed. Use role simulator webhooks to generate tasks!
                  </p>
                ) : (
                  pendingTasks.map((t) => (
                    <div key={t.id} className="py-3.5 flex items-start justify-between gap-3 group">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => handleToggleTaskStatus(t.id, t.status)}
                          className="mt-0.5 w-5 h-5 border border-slate-750 bg-[#0d0d10] rounded-lg flex items-center justify-center hover:bg-emerald-950/20 hover:border-emerald-500 transition cursor-pointer select-none"
                        >
                          <span className="w-2.5 h-2.5 rounded bg-transparent group-hover:bg-emerald-400" />
                        </button>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-100 text-xs leading-none">{t.title}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                              t.priority === 'High' ? 'bg-rose-955/30 text-rose-400 border-rose-900/40' :
                              t.priority === 'Medium' ? 'bg-amber-955/30 text-amber-400 border-amber-900/40' :
                              'bg-green-955/30 text-emerald-400 border-emerald-905'
                            }`}>
                              {t.priority}
                            </span>
                            <span className="px-1.5 py-0.2 bg-[#0d0d10] text-slate-400 rounded text-[9px] border border-slate-800">
                              {t.category}
                            </span>
                          </div>
                          <p className="text-slate-400 text-[11px] mt-1.5 leading-snug">{t.description}</p>
                          
                          {/* Metadata */}
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-2">
                            <span>Deadline: <strong className="text-slate-300">{t.dueDate}</strong></span>
                            <span>&bull;</span>
                            <span>Owner: <strong className="text-indigo-400">{t.assignedTo}</strong></span>
                            {t.linkedTo && (
                              <>
                                <span>&bull;</span>
                                <span className="text-teal-400 font-medium">Link: {t.linkedTo.name} ({t.linkedTo.type})</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {hasAccess('Tasks & Calendar', 'delete') && (
                        <button
                          onClick={() => deleteTask(t.id)}
                          className="p-1 px-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-955/30 rounded-lg transition opacity-60 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Completed section */}
            <div className="bg-[#141418]/50 border border-slate-800/80 rounded-2xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-slate-450 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-400" />
                Done Tasks Log ({completedTasks.length})
              </h4>
              <div className="divide-y divide-slate-800/60 text-xs">
                {completedTasks.slice(0, 5).map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="line-through text-slate-505">{t.title}</span>
                      <span className="text-[10px] bg-[#0d0d10] text-slate-500 border border-slate-800 px-1.5 py-0.5 rounded">Archived</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Completed by {t.assignedTo}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conditionally rendering June Calendar Grid */}
      {activeTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Collapsible Scheduler form on left (4cols) */}
          {isAddingEvent && (
            <div className="bg-[#141418] border border-slate-800 rounded-2xl p-5 shadow-sm lg:col-span-4 animate-fadeIn">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2 mb-3">
                Schedule Meeting Event
              </h3>
              <form onSubmit={handleCreateEvent} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-405 mb-1">EVENT HEADER:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Wayne Corp SLA Scoping" 
                    value={eventTitle}
                    onChange={e => setEventTitle(e.target.value)}
                    className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg focus:outline-none focus:border-indigo-505"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-405 mb-1">DIAL-IN / AGENDA DETAILS:</label>
                  <textarea 
                    placeholder="URL or presentation agenda details..." 
                    value={eventDesc}
                    onChange={e => setEventDesc(e.target.value)}
                    rows={2}
                    className="w-full text-xs p-2.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg focus:outline-none focus:border-indigo-505"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-405 mb-1">START COORDINATES:</label>
                  <input 
                    type="datetime-local" 
                    value={eventStart} 
                    onChange={e => setEventStart(e.target.value)}
                    className="w-full text-xs p-1.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg cursor-pointer text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-405 mb-1">END COORDINATES:</label>
                  <input 
                    type="datetime-local" 
                    value={eventEnd} 
                    onChange={e => setEventEnd(e.target.value)}
                    className="w-full text-xs p-1.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg cursor-pointer text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-405 mb-1">EVENT TYPE:</label>
                  <select 
                    value={eventType} 
                    onChange={e => setEventType(e.target.value as any)}
                    className="w-full text-xs p-1.5 bg-[#0d0d10] border border-slate-800 text-slate-100 rounded-lg cursor-pointer font-bold"
                  >
                    <option value="Meeting" className="bg-[#0f0f12]">Meeting Session</option>
                    <option value="Demo" className="bg-[#0f0f12]">Client Demo</option>
                    <option value="FollowUp" className="bg-[#0f0f12]">Follow-Up Sync</option>
                    <option value="CampaignRun" className="bg-[#0f0f12]">Campaign Blast Run</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Reserve Slot & Broadcast
                </button>
              </form>
            </div>
          )}

          {/* Calendar visual output (8 Columns or full 12) */}
          <div className={`bg-[#141418] border border-slate-800 rounded-2xl p-5 shadow-sm ${isAddingEvent ? 'lg:col-span-8' : 'lg:col-span-12'}`} id="calendar-grid-card">
            {/* Calendar header with months selection Mock */}
            <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="font-bold text-white text-base leading-none">June 2026</h3>
                <p className="text-[10px] text-slate-400 mt-1.5 uppercase tracking-widest font-semibold font-mono">CALENDAR SCHEDULE GRIDS</p>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-450 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-300 font-mono">Real-Time CRM Calendar Node Active</span>
              </div>
            </div>

            {/* Grid display */}
            <div className="grid grid-cols-7 gap-1 bg-[#0d0d10] border border-slate-800 rounded-2xl p-1 overflow-hidden">
              {/* Sun-Sat column titles */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center font-bold text-[10px] text-slate-400 py-1 uppercase tracking-wider bg-[#141418] p-1 rounded-lg">
                  {day}
                </div>
              ))}

              {/* Grid blank cells for Monday padding */}
              {Array.from({ length: startDayPadding }).map((_, index) => (
                <div key={`pad-${index}`} className="aspect-square bg-[#141418]/30 rounded-xl" />
              ))}

              {/* Grid content days of June */}
              {Array.from({ length: juneDaysCount }).map((_, idx) => {
                const dayNumber = idx + 1;
                const dateCode = `2026-06-${dayNumber < 10 ? '0' + dayNumber : dayNumber}`;

                 // Search matching events
                const matchingEvents = calendarEvents.filter(e => e.start.startsWith(dateCode));

                return (
                  <div 
                    key={`day-${dayNumber}`} 
                    onClick={() => {
                      setEventStart(`${dateCode}T09:00:00`);
                      setEventEnd(`${dateCode}T10:30:00`);
                      setIsAddingEvent(true);
                    }}
                    className={`aspect-square bg-[#141418]/60 border border-slate-800/70 p-1.5 p-1 rounded-xl flex flex-col justify-between hover:bg-[#1a1a24] cursor-pointer relative transition duration-150 group ${
                      dayNumber === 9 ? 'ring-2 ring-indigo-550 bg-indigo-950/30' : ''
                    }`}
                  >
                    <span className={`font-bold text-xs ${dayNumber === 9 ? 'text-indigo-400 font-black' : 'text-slate-300'}`}>
                      {dayNumber}
                    </span>

                    {dayNumber === 9 && (
                      <span className="absolute top-1 right-1 px-1 bg-indigo-955/60 border border-indigo-900/40 text-indigo-300 text-[8px] rounded font-bold uppercase tracking-wider font-mono">
                        Today
                      </span>
                    )}

                    {/* Rendering event mini tags */}
                    <div className="space-y-0.5 mt-0.5 max-h-[85%] overflow-y-auto pr-0.5 pointer-events-none">
                      {matchingEvents.map(e => (
                        <div 
                          key={e.id}
                          className={`px-1 py-0.5 ${e.color || 'bg-indigo-605'} border border-black/20 text-white rounded text-[8px] font-bold truncate tracking-wide font-sans flex items-center justify-between`}
                        >
                          <span>{e.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* List agenda below table */}
            <div className="mt-5 border-t border-slate-800 pb-2 pt-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3.5 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-500" />
                Scheduled Calendar Directives Breakdown
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {calendarEvents.map(e => (
                  <div key={e.id} className="p-3.5 bg-[#0d0d10] rounded-xl border border-slate-800/80 flex flex-col justify-between hover:bg-[#1a1a24]/90 transition group relative">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold text-white uppercase border border-[#ffffff]/10 ${e.color}`}>
                          {e.type}
                        </span>
                        
                        {hasAccess('Tasks & Calendar', 'delete') && (
                          <button
                            onClick={(evt) => {
                              evt.stopPropagation();
                              handleDeleteEvent(e.id);
                            }}
                            className="text-slate-500 hover:text-rose-450 hover:bg-rose-955/30 rounded-lg p-0.5 transition cursor-pointer"
                            title="Purge appointment slots"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <h5 className="font-bold text-slate-100 text-xs mt-2 leading-snug">{e.title}</h5>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal">{e.description}</p>
                    </div>

                    <div className="mt-3.5 text-[9px] text-slate-500 font-mono font-bold pt-2 border-t border-slate-800/60 flex justify-between">
                      <span>Start: {e.start.slice(11, 16)}</span>
                      {e.linkedTo && <span className="text-indigo-400">Client: {e.linkedTo}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

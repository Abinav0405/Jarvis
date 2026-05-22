import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, ListTodo, Plus, Trash2 } from 'lucide-react';

const card =
  'rounded-card border border-[rgba(255,255,255,0.1)] bg-[rgba(10,10,12,0.52)] p-4 backdrop-blur-glass';

export function Tasks({ data, persist, pushToast }) {
  const todos = Array.isArray(data.todos) ? data.todos : [];
  const [text, setText] = useState('');

  const addTodo = async () => {
    const t = text.trim();
    if (!t) return;
    await persist((d) => ({
      ...d,
      todos: [
        ...(d.todos || []),
        { id: crypto.randomUUID(), text: t, done: false, createdAt: Date.now() },
      ],
    }));
    setText('');
    pushToast?.('Task added.', 'success');
  };

  const toggleTodo = async (id) => {
    await persist((d) => ({
      ...d,
      todos: (d.todos || []).map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    }));
  };

  const deleteTodo = async (id) => {
    await persist((d) => ({
      ...d,
      todos: (d.todos || []).filter((item) => item.id !== id),
    }));
  };

  const incomplete = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <motion.div
      className="h-full min-h-0 overflow-y-auto jarvis-scrollbar px-6 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div className="mx-auto max-w-2xl space-y-5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <motion.div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--accent)] bg-[rgba(0,212,255,0.08)]">
            <ListTodo className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <motion.div>
            <h1 className="text-2xl font-light text-[#F0F0F0]">Tasks</h1>
            <p className="text-sm text-[rgba(240,240,240,0.45)]">
              Local homework & todos — synced to your JARVIS data on this PC.
            </p>
          </motion.div>
        </motion.div>

        <motion.div className={card}>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addTodo()}
              placeholder="Add a task…"
              className="min-w-0 flex-1 rounded-btn border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-sm text-[#F0F0F0] outline-none placeholder:text-[rgba(255,255,255,0.28)] focus:border-[rgba(0,212,255,0.4)]"
            />
            <motion.button
              type="button"
              onClick={() => void addTodo()}
              className="inline-flex items-center gap-1.5 rounded-pill bg-[var(--accent)] px-4 py-2 text-sm font-bold text-black"
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="h-4 w-4" /> Add
            </motion.button>
          </div>
          <p className="mt-2 text-[10px] text-[rgba(240,240,240,0.35)]">
            {incomplete.length} open · {done.length} completed
          </p>
        </motion.div>

        {incomplete.length > 0 && (
          <motion.div className={card}>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              To do
            </p>
            <ul className="space-y-2">
              {incomplete.map((todo) => (
                <li
                  key={todo.id}
                  className="flex items-center gap-3 rounded-btn border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => void toggleTodo(todo.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.15)] hover:border-[var(--accent)]"
                    aria-label="Mark done"
                  />
                  <span className="min-w-0 flex-1 text-sm text-[#F0F0F0]">{todo.text}</span>
                  <button
                    type="button"
                    onClick={() => void deleteTodo(todo.id)}
                    className="text-[rgba(240,240,240,0.35)] hover:text-rose-400"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {done.length > 0 && (
          <motion.div className={card}>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[rgba(240,240,240,0.4)]">
              Completed
            </p>
            <ul className="space-y-2">
              {done.map((todo) => (
                <li
                  key={todo.id}
                  className="flex items-center gap-3 rounded-btn border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] px-3 py-2 opacity-70"
                >
                  <button
                    type="button"
                    onClick={() => void toggleTodo(todo.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--accent)] bg-[rgba(0,212,255,0.15)] text-[var(--accent)]"
                    aria-label="Mark incomplete"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-0 flex-1 text-sm text-[rgba(240,240,240,0.55)] line-through">
                    {todo.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteTodo(todo.id)}
                    className="text-[rgba(240,240,240,0.35)] hover:text-rose-400"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {todos.length === 0 && (
          <p className="text-center text-sm text-[rgba(240,240,240,0.4)]">
            No tasks yet — add homework, errands, or reminders above.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

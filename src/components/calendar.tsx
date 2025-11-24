import React, { useState } from 'react';
import { Reservation, ReservationStatus } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarViewProps {
  reservations: Reservation[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ reservations }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const padding = Array.from({ length: firstDay }, (_, i) => i);

  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const getReservationForDate = (day: number) => {
    const dateStr = new Date(year, month, day).toISOString().split('T')[0];
    return reservations.find(r => {
      // Simple check if date is within range (inclusive start, exclusive end usually, but simplifying for UI)
      const start = r.checkIn.split('T')[0];
      const end = r.checkOut.split('T')[0];
      return dateStr >= start && dateStr < end && r.status !== ReservationStatus.CANCELLED;
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{monthNames[month]} {year}</h2>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full transition"><ChevronLeft size={20} /></button>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full transition"><ChevronRight size={20} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
          <div key={d} className="bg-gray-50 p-3 text-center text-sm font-medium text-gray-500">{d}</div>
        ))}
        
        {padding.map(i => (
          <div key={`pad-${i}`} className="bg-white h-32"></div>
        ))}

        {days.map(day => {
          const res = getReservationForDate(day);
          const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
          
          return (
            <div key={day} className={`bg-white h-32 p-2 border-t border-gray-100 relative hover:bg-gray-50 transition ${isToday ? 'bg-blue-50/30' : ''}`}>
              <span className={`text-sm font-medium ${isToday ? 'text-blue-600 bg-blue-100 w-7 h-7 flex items-center justify-center rounded-full' : 'text-gray-700'}`}>
                {day}
              </span>
              
              {res && (
                <div 
                  className={`mt-2 p-1.5 text-xs rounded border-l-4 truncate cursor-pointer
                    ${res.source === 'Airbnb' ? 'bg-red-50 border-red-500 text-red-700' : 
                      res.source === 'Booking.com' ? 'bg-blue-50 border-blue-500 text-blue-700' : 
                      'bg-green-50 border-green-500 text-green-700'}`}
                >
                  <span className="font-bold block">{res.guest.name.split(' ')[0]}</span>
                  <span className="opacity-75">{res.source}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;
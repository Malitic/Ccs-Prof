import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Edit2, Search, Mail, CalendarPlus, BookOpen, Eye, EyeOff } from 'lucide-react';
import { useAsync } from '../../hooks/useAsync';
import { useForm } from '../../hooks/useAsync';
import { useSearch } from '../../hooks/useAsync';
import { usePagination } from '../../hooks/useAsync';
import { facultyDB, studentDB, coursesDB, eventsDB } from '../../lib/database';
import { db } from '../../lib/firebase';
import { createUserWithEmailAndPassword, getAuth as getAuthFromApp, signOut as firebaseSignOut } from 'firebase/auth';
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { LoadingSpinner, ErrorMessage, EmptyState, FormInput, SectionHeader, Pagination, Card } from '../../components/ui/shared';
import { emitSyncEvent } from '../../lib/syncEvents';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const secondaryApp =
  getApps().find((app) => app.name === 'faculty-creator') ||
  initializeApp(firebaseConfig, 'faculty-creator');

const secondaryAuth = getAuthFromApp(secondaryApp);

interface Faculty {
  id: string | number;
  name: string;
  email: string;
  department: string;
  specialization: string;
  phone?: string;
  office?: string;
  qualifications?: string;
  event_ids?: string[];
}

interface Course {
  id: string | number;
  code?: string;
  name?: string;
}

interface EventItem {
  id: string | number;
  title?: string;
  date?: string;
  location?: string;
}

interface Student {
  id: string | number;
  name: string;
  email: string;
  idNumber?: string;
}

interface FacultyFormData {
  name: string;
  email: string;
  password: string;
  department: string;
  specialization: string;
  phone: string;
  office: string;
  qualifications: string;
}

const initialFormState: FacultyFormData = {
  name: '',
  email: '',
  password: '',
  department: 'Computer Science',
  specialization: '',
  phone: '',
  office: '',
  qualifications: '',
};

const validationSchema = {
  name: (value: string) => value.trim().length < 3 ? 'Name must be at least 3 characters' : '',
  email: (value: string) => !value.includes('@') ? 'Invalid email address' : '',
  password: (value: string) => value.trim().length < 6 ? 'Password must be at least 6 characters' : '',
  department: (value: string) => value.trim().length === 0 ? 'Department is required' : '',
  specialization: (value: string) => value.trim().length === 0 ? 'Specialization is required' : '',
  phone: (value: string) => value.trim().length === 0 ? 'Phone is required' : '',
  office: (value: string) => value.trim().length === 0 ? 'Office location is required' : '',
  qualifications: (value: string) => value.trim().length === 0 ? 'Qualifications are required' : '',
};

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const AdminFaculty: React.FC = () => {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [showForm, setShowForm] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedSubjectFaculty, setSelectedSubjectFaculty] = useState<string | null>(null);
  const [selectedEventFaculty, setSelectedEventFaculty] = useState<string | null>(null);
  const [selectedMessageFaculty, setSelectedMessageFaculty] = useState<string | null>(null);
  const [subjectValue, setSubjectValue] = useState('');
  const [eventValue, setEventValue] = useState('');
  const [messageStudentId, setMessageStudentId] = useState('');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: facultyData, loading, error, execute: fetchFaculty } = useAsync<Faculty[]>(() =>
    facultyDB.getAllFaculty().then((data: any) => data as Faculty[])
  );

  const { formData, errors, touched, handleChange, handleBlur, reset, setFormData } = useForm<FacultyFormData>(
    initialFormState,
    validationSchema
  );

  const { searchQuery, results: filteredFaculty, setSearchQuery } = useSearch<Faculty>(
    faculty,
    ['name', 'email', 'department', 'specialization']
  );

  // Filter by department
  const departmentFiltered = useMemo(() => {
    if (departmentFilter === 'All') return filteredFaculty;
    return filteredFaculty.filter(f => f.department === departmentFilter);
  }, [filteredFaculty, departmentFilter]);

  const { currentPage, totalPages, currentData, goToPage } = usePagination(departmentFiltered, 5);

  useEffect(() => {
    fetchFaculty();
    const loadSupportingData = async () => {
      try {
        const [loadedCourses, loadedEvents, loadedStudents] = await Promise.all([
          coursesDB.getAllCourses(),
          eventsDB.getAllEvents(),
          studentDB.getAllStudents(),
        ]);
        setCourses(loadedCourses as Course[]);
        setEvents(loadedEvents as EventItem[]);
        setStudents(loadedStudents as Student[]);
      } catch (err) {
        console.error('Failed to load supplemental faculty data', err);
      }
    };

    loadSupportingData();
  }, [fetchFaculty]);

  useEffect(() => {
    if (facultyData && facultyData.length > 0) {
      setFaculty(facultyData);
    }
  }, [facultyData]);

  const departments = useMemo(() => {
    const depts = new Set(faculty.map(f => f.department));
    return ['All', ...Array.from(depts)];
  }, [faculty]);

  const handleAddOrUpdate = async () => {
    const cleaned = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      department: formData.department.trim(),
      specialization: formData.specialization.trim(),
      phone: formData.phone.trim(),
      office: formData.office.trim(),
      qualifications: formData.qualifications.trim(),
    };

    const normalizedPassword = formData.password.trim();

    if (
      !cleaned.name ||
      !cleaned.email ||
      !cleaned.department ||
      !cleaned.specialization ||
      !cleaned.phone ||
      !cleaned.office ||
      !cleaned.qualifications ||
      (!editingId && !normalizedPassword)
    ) {
      alert('Please complete all required faculty fields and provide a password for new faculty accounts.');
      return;
    }

    if (!isValidEmail(cleaned.email)) {
      alert('Please enter a valid email address.');
      return;
    }

    if (!editingId && normalizedPassword.length < 6) {
      alert('Password is required for new faculty and must be at least 6 characters.');
      return;
    }

    if (!db) {
      alert('Database is not initialized.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await facultyDB.updateFaculty(String(editingId), cleaned);

        const userRef = doc(db, 'users', String(editingId));
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          await updateDoc(userRef, {
            ...cleaned,
            role: 'faculty',
            updatedAt: new Date().toISOString(),
          });
        } else {
          await setDoc(userRef, {
            ...cleaned,
            id: String(editingId),
            role: 'faculty',
            createdAt: new Date().toISOString(),
          });
        }

        const updated = faculty.map(f =>
          String(f.id) === String(editingId) ? { ...f, ...cleaned } : f
        );
        setFaculty(updated);
        setEditingId(null);
        window.dispatchEvent(new Event('facultyUpdated'));
        emitSyncEvent('facultyUpdated', { id: editingId, ...cleaned }, 'Faculty');
        alert('Faculty updated successfully!');
      } else {
        const authResult = await createUserWithEmailAndPassword(secondaryAuth, cleaned.email, normalizedPassword);
        const uid = authResult.user.uid;
        await firebaseSignOut(secondaryAuth);

        const facultyPayload = {
          ...cleaned,
          id: uid,
          role: 'faculty',
          createdAt: new Date().toISOString(),
        };

        await facultyDB.addFaculty(facultyPayload);

        const newFaculty: Faculty = {
          ...cleaned,
          id: uid,
        };
        setFaculty(prev => [...prev, newFaculty]);
        window.dispatchEvent(new Event('facultyUpdated'));
        emitSyncEvent('facultyCreated', newFaculty, 'Faculty');
        alert('Faculty added successfully!');
      }
      reset();
      setShowForm(false);
      setPasswordVisible(false);
    } catch (err: any) {
      console.error('faculty save error', err);
      alert(err?.message || 'Failed to save faculty');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (f: Faculty) => {
    setFormData({
      name: f.name,
      email: f.email,
      password: '',
      department: f.department,
      specialization: f.specialization,
      phone: f.phone || '',
      office: f.office || '',
      qualifications: f.qualifications || '',
    });
    setEditingId(String(f.id));
    setShowForm(true);
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('Are you sure you want to delete this faculty member?')) return;

    try {
      await facultyDB.deleteFaculty(String(id));
      setFaculty(faculty.filter(f => String(f.id) !== String(id)));
      window.dispatchEvent(new Event('facultyUpdated'));
      emitSyncEvent('facultyDeleted', { id }, 'Faculty');
      alert('Faculty deleted successfully!');
    } catch (err: any) {
      console.error('faculty delete error', err);
      alert(err?.message || 'Failed to delete faculty');
    }
  };

  const handleAssignSubject = (facultyItem: Faculty) => {
    setSelectedSubjectFaculty(String(facultyItem.id));
    setSubjectValue(facultyItem.specialization || '');
    setSelectedEventFaculty(null);
    setSelectedMessageFaculty(null);
  };

  const submitAssignSubject = async () => {
    if (!selectedSubjectFaculty || !subjectValue.trim()) {
      alert('Please select a subject to assign.');
      return;
    }

    try {
      await facultyDB.assignSubject(selectedSubjectFaculty, subjectValue.trim());
      setFaculty(prev =>
        prev.map(f =>
          String(f.id) === selectedSubjectFaculty ? { ...f, specialization: subjectValue.trim() } : f
        )
      );
      setSelectedSubjectFaculty(null);
      setSubjectValue('');
      window.dispatchEvent(new Event('facultyUpdated'));
      alert('Subject assigned successfully!');
    } catch (err: any) {
      console.error('assign subject error', err);
      alert(err?.message || 'Failed to assign subject');
    }
  };

  const handleAssignEvent = (facultyItem: Faculty) => {
    setSelectedEventFaculty(String(facultyItem.id));
    setEventValue('');
    setSelectedSubjectFaculty(null);
    setSelectedMessageFaculty(null);
  };

  const submitAssignEvent = async () => {
    if (!selectedEventFaculty || !eventValue) {
      alert('Please select an event to assign.');
      return;
    }

    try {
      await facultyDB.assignEvent(selectedEventFaculty, eventValue);
      setFaculty(prev =>
        prev.map(f =>
          String(f.id) === selectedEventFaculty
            ? {
                ...f,
                event_ids: Array.from(new Set([...(f.event_ids || []), eventValue])),
              }
            : f
        )
      );
      setSelectedEventFaculty(null);
      setEventValue('');
      window.dispatchEvent(new Event('facultyUpdated'));
      alert('Event assigned successfully!');
    } catch (err: any) {
      console.error('assign event error', err);
      alert(err?.message || 'Failed to assign event');
    }
  };

  const handleMessageStudent = (facultyItem: Faculty) => {
    setSelectedMessageFaculty(String(facultyItem.id));
    setMessageStudentId('');
    setMessageSubject(`Message from ${facultyItem.name}`);
    setMessageBody('');
    setSelectedSubjectFaculty(null);
    setSelectedEventFaculty(null);
  };

  const submitMessageStudent = async () => {
    if (!selectedMessageFaculty || !messageStudentId || !messageSubject.trim() || !messageBody.trim()) {
      alert('Please select a student, subject, and message body.');
      return;
    }

    try {
      await facultyDB.messageStudent({
        faculty_id: selectedMessageFaculty,
        student_id: messageStudentId,
        subject: messageSubject.trim(),
        message: messageBody.trim(),
      });
      setSelectedMessageFaculty(null);
      setMessageStudentId('');
      setMessageSubject('');
      setMessageBody('');
      alert('Message sent successfully!');
    } catch (err: any) {
      console.error('send message error', err);
      alert(err?.message || 'Failed to send message');
    }
  };

  const handleCancel = () => {
    reset();
    setEditingId(null);
    setShowForm(false);
    setPasswordVisible(false);
  };

  const hasValidationErrors = Object.values(errors).some(e => e);

  return (
    <div>
      <SectionHeader
        title="Faculty Management"
        subtitle="Manage all faculty members in the system"
        action={{ label: showForm ? 'Cancel' : 'Add Faculty', onClick: showForm ? handleCancel : () => setShowForm(true) }}
      />

      {loading && <LoadingSpinner fullScreen={false} />}
      {error && <ErrorMessage message="Failed to load faculty from backend." />}

      {/* Add/Edit Form */}
      {showForm && (
        <Card title={editingId ? 'Edit Faculty' : 'Add New Faculty'} className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormInput
              label="Full Name"
              id="name"
              type="text"
              placeholder="Dr. John Smith"
              value={formData.name}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.name ? errors.name : ''}
            />
            <FormInput
              label="Email Address"
              id="email"
              type="email"
              placeholder="john.smith@university.edu"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.email ? errors.email : ''}
            />
            {!editingId && (
              <div className="relative">
                <FormInput
                  label="Password"
                  id="password"
                  type={passwordVisible ? 'text' : 'password'}
                  placeholder="Enter a secure password"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  error={touched.password ? errors.password : ''}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  className="absolute right-3 top-10 text-gray-500"
                >
                  {passwordVisible ? 'Hide' : 'Show'}
                </button>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Department</label>
              <select
                id="department"
                value={formData.department}
                onChange={handleChange}
                onBlur={handleBlur}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option>Computer Science</option>
                <option>Information Technology</option>
              </select>
              {touched.department && errors.department && (
                <p className="text-red-600 text-xs font-medium mt-1">{errors.department}</p>
              )}
            </div>
            <FormInput
              label="Specialization"
              id="specialization"
              type="text"
              placeholder="e.g., Artificial Intelligence"
              value={formData.specialization}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.specialization ? errors.specialization : ''}
            />
            <FormInput
              label="Phone"
              id="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={formData.phone}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.phone ? errors.phone : ''}
            />
            <FormInput
              label="Office Location"
              id="office"
              type="text"
              placeholder="Building A, Room 201"
              value={formData.office}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.office ? errors.office : ''}
            />
            <FormInput
              label="Qualifications"
              id="qualifications"
              type="text"
              placeholder="Ph.D. in Computer Science"
              value={formData.qualifications}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.qualifications ? errors.qualifications : ''}
            />
            {!editingId && (
              <div className="flex flex-col">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                <div className="flex items-center border border-gray-300 rounded-lg px-4 py-2 bg-white focus-within:ring-2 focus-within:ring-primary">
                  <input
                    id="password"
                    type={passwordVisible ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="flex-1 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible(!passwordVisible)}
                    className="text-gray-500"
                    aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  >
                    {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {touched.password && errors.password && (
                  <p className="text-red-600 text-xs font-medium mt-1">{errors.password}</p>
                )}
              </div>
            )}
            <div className="col-span-full flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleAddOrUpdate}
                disabled={hasValidationErrors || isSubmitting}
                className="bg-primary hover:bg-primary-dark disabled:bg-gray-300 text-white px-6 py-2 rounded-xl font-semibold transition min-w-[170px]"
              >
                {isSubmitting ? 'Processing...' : editingId ? '✓ Update Faculty' : '✚ Add Faculty'}
              </button>
              <button
                onClick={handleCancel}
                className="bg-slate-500 hover:bg-slate-600 text-white px-6 py-2 rounded-xl font-semibold transition min-w-[130px]"
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-8">
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <Search size={20} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, department, or specialization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {departments.map(dept => (
              <button
                key={dept}
                onClick={() => setDepartmentFilter(dept)}
                className={`px-4 py-2 rounded-lg transition font-medium ${
                  departmentFilter === dept
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {selectedSubjectFaculty && (
        <Card title="Assign Faculty Subject" className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <p className="text-sm font-medium text-gray-700 mb-2">Faculty</p>
              <p className="text-gray-800">
                {faculty.find((f) => String(f.id) === selectedSubjectFaculty)?.name || 'Selected faculty'}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Subject</label>
              <select
                value={subjectValue}
                onChange={(e) => setSubjectValue(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Choose a subject</option>
                {courses.map((course) => (
                  <option key={course.id} value={String(course.id)}>
                    {course.code ? `${course.code} - ${course.name}` : course.name}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex gap-3 flex-wrap">
                <button
                  onClick={submitAssignSubject}
                  className="bg-primary hover:bg-primary-dark text-white px-5 py-2 rounded-lg transition"
                >
                  Assign Subject
                </button>
                <button
                  onClick={() => setSelectedSubjectFaculty(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-5 py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {selectedEventFaculty && (
        <Card title="Assign Faculty Event" className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <p className="text-sm font-medium text-gray-700 mb-2">Faculty</p>
              <p className="text-gray-800">
                {faculty.find((f) => String(f.id) === selectedEventFaculty)?.name || 'Selected faculty'}
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Event</label>
              <select
                value={eventValue}
                onChange={(e) => setEventValue(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Choose an event</option>
                {events.map((eventItem) => (
                  <option key={eventItem.id} value={String(eventItem.id)}>
                    {eventItem.title || `Event ${eventItem.id}`}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex gap-3 flex-wrap">
                <button
                  onClick={submitAssignEvent}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg transition"
                >
                  Assign Event
                </button>
                <button
                  onClick={() => setSelectedEventFaculty(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-5 py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {selectedMessageFaculty && (
        <Card title="Message a Student" className="mb-8">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Faculty</p>
              <p className="text-gray-800">
                {faculty.find((f) => String(f.id) === selectedMessageFaculty)?.name || 'Selected faculty'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Student</label>
              <select
                value={messageStudentId}
                onChange={(e) => setMessageStudentId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Choose a student</option>
                {students.map((student) => (
                  <option key={student.id} value={String(student.id)}>
                    {student.name} ({student.email})
                  </option>
                ))}
              </select>
            </div>
            <FormInput
              label="Subject"
              id="messageSubject"
              type="text"
              value={messageSubject}
              onChange={(e) => setMessageSubject(e.target.value)}
              placeholder="Why are you reaching out?"
            />
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary h-32"
                placeholder="Type your message to the student here..."
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={submitMessageStudent}
                className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg transition"
              >
                Send Message
              </button>
              <button
                onClick={() => setSelectedMessageFaculty(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-5 py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Faculty List">
        {!faculty || faculty.length === 0 ? (
          <EmptyState
            icon="Users2"
            title="No faculty members found"
            description="Add a faculty member to get started"
          />
        ) : departmentFiltered.length === 0 ? (
          <EmptyState
            icon="Search"
            title="No matching faculty"
            description={`No faculty match your filters`}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Department</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Specialization</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.map((f) => (
                    <tr key={f.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-800">{f.name}</td>
                      <td className="py-3 px-4 text-gray-600">{f.email}</td>
                      <td className="py-3 px-4 text-gray-600">{f.department}</td>
                      <td className="py-3 px-4">
                        <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">
                          {f.specialization}
                        </span>
                      </td>
                      <td className="py-3 px-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleEdit(f)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleAssignSubject(f)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded transition"
                          title="Assign Subject"
                        >
                          <BookOpen size={18} />
                        </button>
                        <button
                          onClick={() => handleAssignEvent(f)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded transition"
                          title="Assign Event"
                        >
                          <CalendarPlus size={18} />
                        </button>
                        <button
                          onClick={() => handleMessageStudent(f)}
                          className="p-2 text-blue-800 hover:bg-blue-50 rounded transition"
                          title="Message Student"
                        >
                          <Mail size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(f.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
                itemsPerPage={5}
                onItemsPerPageChange={() => {}}
              />
              <p className="mt-4 text-sm text-gray-600">
                Showing {currentData.length === 0 ? 0 : (currentPage - 1) * 5 + 1} to {Math.min(currentPage * 5, departmentFiltered.length)} of {departmentFiltered.length} faculty members
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

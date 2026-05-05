import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Search, X, User } from 'lucide-react';
import { useAsync, useForm, usePagination, useSearch } from '../../hooks/useAsync';
import { studentDB } from '../../lib/database';
import { db } from '../../lib/firebase';
import { createUserWithEmailAndPassword, getAuth as getAuthFromApp, signOut as firebaseSignOut } from 'firebase/auth';
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { FormInput, SectionHeader, Card } from '../../components/ui/shared';
import { emitSyncEvent } from '../../lib/syncEvents';

// Setup secondary Firebase app for student account creation
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
  getApps().find((app) => app.name === 'student-creator') ||
  initializeApp(firebaseConfig, 'student-creator');

const secondaryAuth = getAuthFromApp(secondaryApp);

const initialFormState = {
  name: '',
  email: '',
  idNumber: '',
  section: '',
  year: '1st',
  program: 'BSCS',
  status: 'Regular',
  phone: '',
  address: '',
  dateOfBirth: '',
  skills: '',
  organizations: '',
  password: '',
};

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const AdminStudents: React.FC = () => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingStudent, setViewingStudent] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [yearFilter, setYearFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [skillFilter, setSkillFilter] = useState('All');
  const [organizationFilter, setOrganizationFilter] = useState('All');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetcher = useMemo(() => () => studentDB.getAllStudents(), []);
  const { data: studentsData, execute: refreshStudents } = useAsync(fetcher);
  const { formData, handleChange, reset, setFormData } = useForm(initialFormState, {});

  const searchFields: (keyof typeof initialFormState)[] = ['name', 'idNumber', 'email', 'program'];
  const { searchQuery, results: filteredStudents, setSearchQuery } = useSearch(studentsData || [], searchFields);
  const students = studentsData || [];

  const skillOptions = useMemo(() => {
    const unique = new Set<string>();
    students.forEach((student: any) => {
      const rawSkills = typeof student.skills === 'string' ? student.skills : '';
      rawSkills
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
        .forEach((s: string) => unique.add(s));
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const organizationOptions = useMemo(() => {
    const unique = new Set<string>();
    students.forEach((student: any) => {
      const rawOrganizations = typeof student.organizations === 'string' ? student.organizations : '';
      rawOrganizations
        .split(',')
        .map((o: string) => o.trim())
        .filter(Boolean)
        .forEach((o: string) => unique.add(o));
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [students]);

  const sectionOptions = useMemo(() => {
    const programPrefixes: Record<string, string> = {
      BSCS: 'CS',
      BSIT: 'IT',
    };

    const yearPrefixMap: Record<string, string> = {
      '1st': '1',
      '2nd': '2',
      '3rd': '3',
      '4th': '4',
    };

    const selectedProgramPrefix = programPrefixes[formData.program] || 'IT';
    const selectedYearPrefix = yearPrefixMap[formData.year] || '';
    const selectedYearSections = selectedYearPrefix
      ? [
          `${selectedYearPrefix}${selectedProgramPrefix}-A`,
          `${selectedYearPrefix}${selectedProgramPrefix}-B`,
          `${selectedYearPrefix}${selectedProgramPrefix}-C`,
          `${selectedYearPrefix}${selectedProgramPrefix}-D`,
          `${selectedYearPrefix}${selectedProgramPrefix}-E`,
        ]
      : [];

    const unique = new Set<string>();
    students.forEach((student: any) => {
      const section = typeof student.section === 'string' ? student.section.trim() : '';
      const studentYear = typeof student.year === 'string' ? student.year.trim() : '';
      const studentProgram = typeof student.program === 'string' ? student.program.trim() : '';
      const studentProgramPrefix = programPrefixes[studentProgram] || '';
      const studentYearPrefix = yearPrefixMap[studentYear] || '';
      const expectedPrefix = studentProgramPrefix ? `${studentYearPrefix}${studentProgramPrefix}` : '';

      if (section && expectedPrefix && section.startsWith(expectedPrefix)) {
        unique.add(section);
      }
    });

    return Array.from(new Set([...unique, ...selectedYearSections])).sort((a, b) => a.localeCompare(b));
  }, [students, formData.year, formData.program]);

  const clearSectionIfMismatch = (nextYear: string, nextProgram: string) => {
    const programPrefixes: Record<string, string> = {
      BSCS: 'CS',
      BSIT: 'IT',
    };

    const yearPrefixMap: Record<string, string> = {
      '1st': '1',
      '2nd': '2',
      '3rd': '3',
      '4th': '4',
    };

    const currentSection = String(formData.section || '');
    const expectedPrefix = `${yearPrefixMap[nextYear] || ''}${programPrefixes[nextProgram] || ''}`;

    if (currentSection && expectedPrefix && !currentSection.startsWith(expectedPrefix)) {
      setFormData({
        ...formData,
        year: nextYear,
        program: nextProgram,
        section: '',
      });
      return true;
    }

    return false;
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextYear = event.target.value;
    if (clearSectionIfMismatch(nextYear, formData.program)) {
      return;
    }

    handleChange(event);
  };

  const handleProgramChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProgram = event.target.value;
    if (clearSectionIfMismatch(formData.year, nextProgram)) {
      return;
    }

    handleChange(event);
  };

  const displayedStudents = useMemo(() => {
    return filteredStudents.filter((student: any) => {
      const matchesYear = yearFilter === 'All' || student.year === yearFilter;
      const matchesStatus = statusFilter === 'All' || student.status === statusFilter;

      const studentSkills = typeof student.skills === 'string' ? student.skills.toLowerCase() : '';
      const matchesSkill = skillFilter === 'All' || studentSkills.split(',').map((s: string) => s.trim()).includes(skillFilter.toLowerCase());

      const studentOrganizations = typeof student.organizations === 'string' ? student.organizations.toLowerCase() : '';
      const matchesOrganization =
        organizationFilter === 'All' || studentOrganizations.split(',').map((o: string) => o.trim()).includes(organizationFilter.toLowerCase());

      return matchesYear && matchesStatus && matchesSkill && matchesOrganization;
    });
  }, [filteredStudents, yearFilter, statusFilter, skillFilter, organizationFilter]);

  const {
    currentPage,
    totalPages,
    currentData: pagedStudents,
    goToPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagination(displayedStudents, 20);

  const handleEdit = (student: any) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingId(student.id);
    setFormData({
      ...initialFormState,
      ...student,
      password: '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete student "${name}"? This action cannot be undone.`)) return;
    if (!db) {
      setErrorMessage('Database is not initialized.');
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('[STUDENT] Deleting student:', id);
      await studentDB.deleteStudent(id);
      await deleteDoc(doc(db, 'users', id));
      console.log('[STUDENT] Student deleted successfully');
      setSuccessMessage(`Student "${name}" deleted successfully.`);
      await refreshStudents();
      emitSyncEvent('studentDeleted', { id, name }, 'Students');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('[STUDENT] Delete Error:', err);
      setErrorMessage(err.message || 'Failed to delete student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddOrUpdate = async () => {
    const normalizedEmail = formData.email.trim().toLowerCase();
    const normalizedName = formData.name.trim();
    const normalizedPassword = formData.password.trim();

    // Validation
    if (!normalizedName) {
      setErrorMessage('Full name is required.');
      return;
    }
    if (!normalizedEmail) {
      setErrorMessage('Email is required.');
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address (example: student@email.com).');
      return;
    }
    if (!editingId && !normalizedPassword) {
      setErrorMessage('Password is required for new students (minimum 6 characters).');
      return;
    }
    if (!editingId && normalizedPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    if (!db) {
      setErrorMessage('Database is not initialized.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { password, ...dataToSave } = formData;
      const cleanedDataToSave = {
        ...dataToSave,
        name: normalizedName,
        email: normalizedEmail,
      };

      if (editingId) {
        // UPDATE OPERATION
        console.log('[STUDENT] Updating student:', editingId);
        await studentDB.updateStudent(editingId, cleanedDataToSave);

        const userRef = doc(db, 'users', editingId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          await updateDoc(userRef, {
            ...cleanedDataToSave,
            updatedAt: new Date().toISOString(),
          });
          console.log('[STUDENT] Firestore user doc updated');
        } else {
          await setDoc(userRef, {
            ...cleanedDataToSave,
            id: editingId,
            role: 'student',
            createdAt: new Date().toISOString(),
          });
          console.log('[STUDENT] Firestore user doc created');
        }

        setSuccessMessage(`Student "${normalizedName}" updated successfully!`);
        emitSyncEvent('studentUpdated', { id: editingId, ...cleanedDataToSave }, 'Students');
      } else {
        // CREATE OPERATION
        console.log('[STUDENT] Creating new student account:', normalizedEmail);
        const authResult = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, normalizedPassword);
        const uid = authResult.user.uid;
        console.log('[STUDENT] Firebase Auth created user with UID:', uid);

        const userData = {
          ...cleanedDataToSave,
          id: uid,
          role: 'student',
          createdAt: new Date().toISOString(),
        };

        await firebaseSignOut(secondaryAuth);

        console.log('[STUDENT] Adding to student database');
        await studentDB.addStudent(userData);

        setSuccessMessage(`Student "${normalizedName}" created successfully!\n\n📧 Email: ${normalizedEmail}\n🔐 Password: ${normalizedPassword}\n\nStudent can now log in.`);
        emitSyncEvent('studentCreated', userData, 'Students');
        console.log('[STUDENT] Student created and synced successfully');
      }

      await refreshStudents();
      handleCancel();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('[STUDENT] Submit Error:', err);
      const errorMsg = err.code === 'auth/email-already-in-use' 
        ? 'Email already in use. Please use a different email address.' 
        : err.message || 'An error occurred. Please try again.';
      setErrorMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    reset();
    setEditingId(null);
    setShowForm(false);
    setPasswordVisible(false);
    setErrorMessage(null);
  };

  return (
    <div className="p-4 space-y-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Students Management"
        subtitle="Create, read, update, and delete student accounts and profiles"
        action={{
          label: showForm ? 'Close Form' : '✚ Register New Student',
          onClick: showForm ? handleCancel : () => {
            setErrorMessage(null);
            setSuccessMessage(null);
            setShowForm(true);
          },
        }}
      />

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-start gap-4">
          <div className="flex-1">
            <h3 className="text-red-800 font-semibold">Error</h3>
            <p className="text-red-700 text-sm whitespace-pre-wrap">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-500 hover:text-red-700">
            <X size={20} />
          </button>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex justify-between items-start gap-4">
          <div className="flex-1">
            <h3 className="text-green-800 font-semibold">Success</h3>
            <p className="text-green-700 text-sm whitespace-pre-wrap">{successMessage}</p>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-green-500 hover:text-green-700">
            <X size={20} />
          </button>
        </div>
      )}

      {showForm && (
        <Card title={editingId ? `✏️ Editing: ${formData.name}` : '✚ Register New Student'}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormInput label="Full Name" id="name" value={formData.name} onChange={handleChange} placeholder="e.g., John Doe" />
            <FormInput label="Email" id="email" type="email" value={formData.email} onChange={handleChange} placeholder="e.g., john@example.com" />

            {!editingId && (
              <div className="flex flex-col">
                <label className="text-sm font-semibold mb-1 text-gray-700">Password <span className="text-red-500">*</span></label>
                <div className="flex items-center border p-2 rounded-lg bg-white focus-within:ring-2 focus-within:ring-teal-500">
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    id="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Min 6 characters"
                    className="flex-1 outline-none"
                  />
                  <button type="button" onClick={() => setPasswordVisible(!passwordVisible)} className="text-gray-400 hover:text-gray-600">
                    {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters long</p>
              </div>
            )}

            <FormInput label="ID Number" id="idNumber" value={formData.idNumber} onChange={handleChange} placeholder="e.g., 2024-001" />
            <div className="flex flex-col">
              <label className="text-sm font-semibold mb-1 text-gray-700">Section</label>
              <select
                id="section"
                value={formData.section}
                onChange={handleChange}
                className="border p-2 rounded-lg bg-white outline-none focus:ring-2 focus:ring-teal-500"
                disabled={!formData.year}
              >
                <option value="">Select Section</option>
                {sectionOptions.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </div>
            <FormInput label="Phone" id="phone" value={formData.phone} onChange={handleChange} placeholder="+63 912 345 6789" />
            <FormInput label="Address" id="address" value={formData.address} onChange={handleChange} placeholder="Street, City, Province" />
            <FormInput label="Date of Birth" id="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleChange} />

            <div className="flex flex-col">
              <label className="text-sm font-semibold mb-1 text-gray-700">Program</label>
              <select
                id="program"
                value={formData.program}
                onChange={handleProgramChange}
                className="border p-2 rounded-lg bg-white outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="BSCS">BSCS (Bachelor of Science in Computer Science)</option>
                <option value="BSIT">BSIT (Bachelor of Science in Information Technology)</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-semibold mb-1 text-gray-700">Year Level</label>
              <select id="year" value={formData.year} onChange={handleYearChange} className="border p-2 rounded-lg bg-white outline-none focus:ring-2 focus:ring-teal-500">
                <option value="1st">1st Year</option>
                <option value="2nd">2nd Year</option>
                <option value="3rd">3rd Year</option>
                <option value="4th">4th Year</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-semibold mb-1 text-gray-700">Status</label>
              <select id="status" value={formData.status} onChange={handleChange} className="border p-2 rounded-lg bg-white font-semibold outline-none focus:ring-2 focus:ring-teal-500">
                <option value="Regular">Regular</option>
                <option value="Irregular">Irregular</option>
              </select>
            </div>

            <FormInput label="Skills" id="skills" value={formData.skills} onChange={handleChange} placeholder="e.g., Java, Python, React (comma-separated)" />
            <FormInput label="Organizations" id="organizations" value={formData.organizations} onChange={handleChange} placeholder="e.g., ACM, IEEE (comma-separated)" />

            <div className="col-span-full flex gap-3 mt-6 pt-4 border-t">
              <button
                onClick={handleAddOrUpdate}
                disabled={isSubmitting}
                className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white px-8 py-2.5 rounded-lg font-bold transition"
              >
                {isSubmitting ? '⏳ Processing...' : editingId ? '✓ Save Changes' : '✚ Create Student'}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSubmitting}
                className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white px-8 py-2.5 rounded-lg font-bold transition"
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="relative mb-6">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by Name, ID, or Program..."
            className="w-full pl-10 pr-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-teal-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="border p-2 rounded-xl bg-white outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Year Levels</option>
            <option value="1st">1st Year</option>
            <option value="2nd">2nd Year</option>
            <option value="3rd">3rd Year</option>
            <option value="4th">4th Year</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border p-2 rounded-xl bg-white outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Status</option>
            <option value="Regular">Regular</option>
            <option value="Irregular">Irregular</option>
          </select>

          <select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} className="border p-2 rounded-xl bg-white outline-none focus:ring-2 focus:ring-teal-500">
            <option value="All">All Skills</option>
            {skillOptions.map((skill) => (
              <option key={skill} value={skill}>
                {skill}
              </option>
            ))}
          </select>

          <select
            value={organizationFilter}
            onChange={(e) => setOrganizationFilter(e.target.value)}
            className="border p-2 rounded-xl bg-white outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="All">All Organizations</option>
            {organizationOptions.map((organization) => (
              <option key={organization} value={organization}>
                {organization}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-gray-400 text-xs uppercase">
                <th className="p-4">Student</th>
                <th className="p-4">ID Number</th>
                <th className="p-4">Program / Year</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pagedStudents.map((s: any) => (
                <tr key={s.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{s.name}</div>
                    <div className="text-xs text-gray-400">{s.email}</div>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{s.idNumber}</td>
                  <td className="p-4 text-sm">
                    <div className="font-bold text-blue-600">{s.program}</div>
                    <div className="text-gray-400">{s.year} Year</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.status === 'Irregular' ? 'bg-teal-100 text-teal-600' : 'bg-green-100 text-green-600'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-1 flex justify-end">
                    <button 
                      onClick={() => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        setViewingStudent(s);
                      }} 
                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors font-medium text-sm" 
                      title="View Profile"
                    >
                      👁️ View
                    </button>
                    <button 
                      onClick={() => handleEdit(s)} 
                      className="text-teal-600 hover:text-teal-800 hover:bg-teal-50 p-2 rounded-lg transition-colors font-medium text-sm" 
                      title="Edit"
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(s.id, s.name)} 
                      className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors font-medium text-sm" 
                      title="Delete"
                    >
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <label htmlFor="students-per-page">Rows per page:</label>
            <select
              id="students-per-page"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                goToPage(1);
              }}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Showing {displayedStudents.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, displayedStudents.length)} of {displayedStudents.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </Card>

      {viewingStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-teal-600 to-teal-400 p-6 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-full">
                  <User size={32} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{viewingStudent.name}</h2>
                  <p className="text-teal-100 text-sm">ID: {viewingStudent.idNumber}</p>
                </div>
              </div>
              <button onClick={() => setViewingStudent(null)} className="hover:bg-white/10 p-2 rounded-full transition">
                <X size={24} />
              </button>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs uppercase text-gray-400 font-bold mb-2">📧 Email Address</p>
                <p className="text-gray-800 font-medium">{viewingStudent.email}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 font-bold mb-2">📱 Phone Number</p>
                <p className="text-gray-800 font-medium">{viewingStudent.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 font-bold mb-2">🎓 Program & Year</p>
                <p className="text-gray-800 font-semibold">
                  {viewingStudent.program} - {viewingStudent.year} Year
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 font-bold mb-2">✓ Status</p>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${viewingStudent.status === 'Irregular' ? 'bg-teal-100 text-teal-700' : 'bg-green-100 text-green-700'}`}>
                  {viewingStudent.status}
                </span>
              </div>
              <div className="col-span-full border-t pt-4">
                <p className="text-xs uppercase text-gray-400 font-bold mb-2">📍 Address</p>
                <p className="text-gray-800">{viewingStudent.address || 'No address provided'}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 font-bold mb-2">💡 Skills</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {viewingStudent.skills
                    ? viewingStudent.skills.split(',').map((skill: string) => (
                        <span key={skill} className="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full font-medium">
                          {skill.trim()}
                        </span>
                      ))
                    : <span className="text-gray-500 text-sm">None added</span>}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-gray-400 font-bold mb-2">🏢 Organizations</p>
                <p className="text-gray-800">{viewingStudent.organizations || 'None'}</p>
              </div>
            </div>
            <div className="bg-gray-50 p-4 flex justify-end gap-3 border-t">
              <button 
                onClick={() => handleEdit(viewingStudent)} 
                className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-bold transition"
              >
                ✏️ Edit Student
              </button>
              <button 
                onClick={() => setViewingStudent(null)} 
                className="bg-gray-800 hover:bg-gray-900 text-white px-6 py-2 rounded-lg font-bold transition"
              >
                ✕ Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
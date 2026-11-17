import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createAcademicResource,
  deleteAcademicResource,
  incrementResourceDownload,
} from '../services/supabaseService';
import { downloadDataUrl, getFilePreviewKind } from '../utils/fileHelpers';
import { FilePreviewModal } from './FilePreviewModal';
import {
  AcademicResource,
  AppUser,
  DepartmentItem,
  formatFileSize,
  formatShortTime,
  GSU_FACULTIES,
  MAX_RESOURCE_FILE_BYTES,
  RESOURCE_CATEGORIES,
  RESOURCE_LEVELS,
  ResourceCategory,
  ResourceLevel,
} from '../types';
import { RoleBadge } from './RoleBadge';

interface RepositoryViewProps {
  currentUser: AppUser;
  resources: AcademicResource[];
  departments: DepartmentItem[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

export const RepositoryView: React.FC<RepositoryViewProps> = ({
  currentUser,
  resources,
  departments,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState<string>('All');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedLevel, setSelectedLevel] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'downloads' | 'courseCode'>('newest');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<AcademicResource | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Upload form state
  const userDeptObj = useMemo(
    () => departments.find((d) => d.name === currentUser.department),
    [departments, currentUser.department]
  );

  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [category, setCategory] = useState<ResourceCategory>('Past Questions');
  const [uploadFaculty, setUploadFaculty] = useState<string>(
    userDeptObj?.faculty || GSU_FACULTIES[0]
  );
  const [uploadDepartment, setUploadDepartment] = useState<string>(
    currentUser.department || departments[0]?.name || 'Science Laboratory Technology'
  );
  const [uploadLevel, setUploadLevel] = useState<ResourceLevel>(
    currentUser.level === 'Staff' ? 'General' : (currentUser.level as ResourceLevel)
  );
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const facultyOptions = useMemo(() => {
    const set = new Set<string>(GSU_FACULTIES);
    departments.forEach((d) => {
      if (d.faculty) set.add(d.faculty);
    });
    return Array.from(set).sort();
  }, [departments]);

  const filterDepartments = useMemo(() => {
    if (selectedFaculty === 'All') return departments;
    return departments.filter((d) => d.faculty === selectedFaculty);
  }, [departments, selectedFaculty]);

  const uploadDepartments = useMemo(() => {
    const matching = departments.filter((d) => d.faculty === uploadFaculty);
    return matching.length > 0 ? matching : departments;
  }, [departments, uploadFaculty]);

  const filteredResources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = resources.filter((item) => {
      if (selectedFaculty !== 'All' && item.faculty !== selectedFaculty) return false;
      if (selectedDepartment !== 'All' && item.department !== selectedDepartment) return false;
      if (selectedLevel !== 'All' && item.level !== selectedLevel) return false;
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.courseCode.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.faculty.toLowerCase().includes(q) ||
        item.authorName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'downloads') {
      return [...list].sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
    }
    if (sortBy === 'courseCode') {
      return [...list].sort((a, b) => a.courseCode.localeCompare(b.courseCode));
    }
    return list;
  }, [
    resources,
    searchQuery,
    selectedFaculty,
    selectedDepartment,
    selectedLevel,
    selectedCategory,
    sortBy,
  ]);

  const myDeptFaculty = userDeptObj?.faculty || 'All';
  const myTargetLevel: string = currentUser.level === 'Staff' ? 'All' : currentUser.level;
  const isMyDeptLevelActive =
    selectedDepartment === currentUser.department &&
    selectedLevel === myTargetLevel &&
    selectedFaculty === myDeptFaculty;

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedFaculty !== 'All' ||
    selectedDepartment !== 'All' ||
    selectedLevel !== 'All' ||
    selectedCategory !== 'All' ||
    sortBy !== 'newest';

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedFaculty('All');
    setSelectedDepartment('All');
    setSelectedLevel('All');
    setSelectedCategory('All');
    setSortBy('newest');
  };

  const toggleMyDeptLevel = () => {
    if (isMyDeptLevelActive) {
      resetFilters();
    } else {
      setSelectedFaculty(myDeptFaculty);
      setSelectedDepartment(currentUser.department);
      setSelectedLevel(myTargetLevel);
    }
  };

  const openUploadModal = () => {
    const defaultFaculty = userDeptObj?.faculty || GSU_FACULTIES[0];
    setUploadFaculty(defaultFaculty);
    setUploadDepartment(
      currentUser.department ||
        departments.find((d) => d.faculty === defaultFaculty)?.name ||
        departments[0]?.name ||
        'Science Laboratory Technology'
    );
    setUploadLevel(
      currentUser.level === 'Staff' ? 'General' : (currentUser.level as ResourceLevel)
    );
    setTitle('');
    setCourseCode('');
    setCategory('Past Questions');
    setDescription('');
    setSelectedFile(null);
    setFormError(null);
    setUploadOpen(true);
  };

  const handleUploadFacultyChange = (nextFaculty: string) => {
    setUploadFaculty(nextFaculty);
    const matching = departments.filter((d) => d.faculty === nextFaculty);
    if (matching.length > 0 && !matching.some((d) => d.name === uploadDepartment)) {
      setUploadDepartment(matching[0].name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size === 0) {
      setFormError('Selected file is empty. Please choose another file.');
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_RESOURCE_FILE_BYTES) {
      setFormError(
        `File is ${formatFileSize(file.size)}. Maximum allowed file size is ${formatFileSize(
          MAX_RESOURCE_FILE_BYTES
        )}.`
      );
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      const stripped = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      setTitle(stripped.slice(0, 140));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    setFormError(null);

    if (!selectedFile) {
      setFormError('Please select a document, PDF, image, or note file to upload.');
      return;
    }
    if (selectedFile.size > MAX_RESOURCE_FILE_BYTES) {
      setFormError(`Maximum allowed file size is ${formatFileSize(MAX_RESOURCE_FILE_BYTES)}.`);
      return;
    }

    setUploading(true);
    try {
      await createAcademicResource(currentUser, {
        title,
        description,
        category,
        faculty: uploadFaculty,
        department: uploadDepartment,
        level: uploadLevel,
        courseCode,
        file: selectedFile,
      });
      setUploadOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload resource.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (item: AcademicResource) => {
    setBannerError(null);
    setDownloadingId(item.id);
    try {
      await downloadDataUrl(
        item.fileData,
        item.fileName || `${item.courseCode || 'gsu-resource'}`
      );
      await incrementResourceDownload(item.id);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not complete download.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (item: AcademicResource) => {
    setBannerError(null);
    setDeletingId(item.id);
    try {
      await deleteAcademicResource(item.id);
      if (confirmDeleteId === item.id) setConfirmDeleteId(null);
      if (previewItem?.id === item.id) setPreviewItem(null);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not delete resource.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Academic Resource Repository
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Share and download past questions, lecture handouts, lab manuals, and study notes across GSU departments.
          </p>
        </div>

        <button
          type="button"
          onClick={openUploadModal}
          className="min-h-[44px] px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Material</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by course code (e.g., PHYS 401), title, department, or author..."
            aria-label="Search academic resources"
            className="w-full min-h-[44px] pl-10 pr-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear resource search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div>
            <label htmlFor="repoFacultyFilter" className="sr-only">
              Filter by faculty
            </label>
            <select
              id="repoFacultyFilter"
              value={selectedFaculty}
              onChange={(e) => {
                setSelectedFaculty(e.target.value);
                setSelectedDepartment('All');
              }}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
            >
              <option value="All">All Faculties</option>
              {facultyOptions.map((fac) => (
                <option key={fac} value={fac}>
                  Faculty of {fac}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="repoDeptFilter" className="sr-only">
              Filter by department
            </label>
            <select
              id="repoDeptFilter"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
            >
              <option value="All">All Departments</option>
              {filterDepartments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="repoLevelFilter" className="sr-only">
              Filter by level
            </label>
            <select
              id="repoLevelFilter"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
            >
              <option value="All">All Levels</option>
              {RESOURCE_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === 'General' ? 'General / All Levels' : `${lvl} Level`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="repoCategoryFilter" className="sr-only">
              Filter by material type
            </label>
            <select
              id="repoCategoryFilter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
            >
              <option value="All">All Material Types</option>
              {RESOURCE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              <span className="tabular-nums">
                Showing {filteredResources.length} of {resources.length} study materials
              </span>
            </span>
            <button
              type="button"
              onClick={toggleMyDeptLevel}
              className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                isMyDeptLevelActive
                  ? 'bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>
                My Dept{myTargetLevel !== 'All' ? ` · ${myTargetLevel}L` : ''}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              aria-label="Sort resources"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'downloads' | 'courseCode')}
              className="min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
            >
              <option value="newest">Sort: Newest</option>
              <option value="downloads">Sort: Most Downloaded</option>
              <option value="courseCode">Sort: Course Code (A–Z)</option>
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </div>

      {bannerError && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{bannerError}</span>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-red-500 hover:text-red-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Resources List */}
      {filteredResources.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {resources.length === 0
              ? 'No academic materials uploaded yet'
              : 'No matching resources found'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {resources.length === 0
              ? 'Be the first to upload past questions, lecture handouts, or lab manuals for your department.'
              : 'Try adjusting your faculty, department, level, or course code search.'}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-1 inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
            >
              Clear Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={openUploadModal}
              className="mt-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload First Material</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredResources.map((item) => {
            const canDelete =
              item.authorId === currentUser.uid ||
              currentUser.role === 'admin' ||
              (['classRep', 'deptHelper', 'lecturer'].includes(currentUser.role) &&
                item.department === currentUser.department);
            const isPreviewable =
              getFilePreviewKind(item.mimeType, item.fileName, item.fileData) !== null;
            return (
              <article
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {item.courseCode}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {item.category}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {item.level === 'General' ? 'General' : `${item.level}L`}
                        </span>
                      </p>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 mt-1 leading-snug">
                        {item.title}
                      </h3>
                    </div>

                    {canDelete && (
                      confirmDeleteId === item.id ? (
                        <div className="inline-flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.id}
                            className="min-h-[32px] px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            {deletingId === item.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[32px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          disabled={deletingId === item.id}
                          aria-label={`Delete ${item.title}`}
                          title="Delete material"
                          className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.department} · Faculty of {item.faculty}
                  </p>

                  {item.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 px-3 py-2.5 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {item.fileName}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatFileSize(item.fileSizeBytes)} · {item.downloadCount}{' '}
                          {item.downloadCount === 1 ? 'download' : 'downloads'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPreviewable && (
                        <button
                          type="button"
                          onClick={() => setPreviewItem(item)}
                          aria-label={`Preview ${item.title}`}
                          title="Preview material"
                          className="min-w-[38px] min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Preview</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownload(item)}
                        disabled={downloadingId === item.id}
                        className="min-h-[40px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{downloadingId === item.id ? 'Saving...' : 'Download'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                        {item.authorName}
                      </span>
                      <RoleBadge role={item.authorRole} showStudent={true} />
                    </div>
                    <span className="font-mono shrink-0">
                      {formatShortTime(item.createdAt)}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="min-h-[40px] px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            {loadingMore ? 'Loading more...' : 'Load more study materials'}
          </button>
        </div>
      )}

      {/* Upload Material Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Upload Academic Material
              </h3>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                aria-label="Close upload dialog"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 p-3 text-xs text-red-700 dark:text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Attach File (PDF, Handout, Notes, Image — max {formatFileSize(MAX_RESOURCE_FILE_BYTES)})
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[56px] px-4 py-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 hover:border-emerald-600 dark:hover:border-emerald-500 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Upload className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                      {selectedFile
                        ? selectedFile.name
                        : 'Choose a file from your device...'}
                    </span>
                  </div>
                  {selectedFile && (
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                      {formatFileSize(selectedFile.size)}
                    </span>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="resCourseCode"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Course Code
                  </label>
                  <input
                    id="resCourseCode"
                    type="text"
                    required
                    maxLength={20}
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="e.g., PHYS 401"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 uppercase focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="resCategory"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Material Type
                  </label>
                  <select
                    id="resCategory"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ResourceCategory)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                  >
                    {RESOURCE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="resTitle"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Title
                </label>
                <input
                  id="resTitle"
                  type="text"
                  required
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Quantum Mechanics Past Questions (2021–2024)"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="resFaculty"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Faculty
                  </label>
                  <select
                    id="resFaculty"
                    value={uploadFaculty}
                    onChange={(e) => handleUploadFacultyChange(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                  >
                    {facultyOptions.map((fac) => (
                      <option key={fac} value={fac}>
                        {fac}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="resDepartment"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Department
                  </label>
                  <select
                    id="resDepartment"
                    value={uploadDepartment}
                    onChange={(e) => setUploadDepartment(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                  >
                    {uploadDepartments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="resLevel"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Level
                  </label>
                  <select
                    id="resLevel"
                    value={uploadLevel}
                    onChange={(e) => setUploadLevel(e.target.value as ResourceLevel)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                  >
                    {RESOURCE_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl === 'General' ? 'General' : `${lvl} Level`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="resDesc"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Short Notes / Topics Covered (optional)
                </label>
                <textarea
                  id="resDesc"
                  rows={2}
                  maxLength={400}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mention lecturer name, semester, or key chapters included..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                >
                  {uploading ? 'Uploading...' : 'Publish Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <FilePreviewModal
        file={
          previewItem
            ? {
                fileName: previewItem.fileName,
                mimeType: previewItem.mimeType,
                dataUrl: previewItem.fileData,
                subtitle: `${previewItem.courseCode} · ${previewItem.category} · ${formatFileSize(
                  previewItem.fileSizeBytes
                )}`,
              }
            : null
        }
        onClose={() => setPreviewItem(null)}
        onDownload={previewItem ? () => handleDownload(previewItem) : undefined}
      />
    </div>
  );
};

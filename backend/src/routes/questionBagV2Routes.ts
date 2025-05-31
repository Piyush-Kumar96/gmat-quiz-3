import express from 'express';
import mongoose from 'mongoose';
import { QuestionBagV2 } from '../models/QuestionBagV2';

const router = express.Router();

/**
 * Transform QuestionBagV2 document to format expected by frontend
 */
const transformQuestionForFrontend = (question: any) => {
    // Convert options object to array format for frontend compatibility
  const transformedQuestion = {
    ...question.toObject ? question.toObject() : question,
    options: Object.entries(question.options || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, text]) => text)
  };
  
  return transformedQuestion;
};

// Get all questions with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Apply filters if provided
    const filter: any = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.questionType) filter.questionType = req.query.questionType;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;

    console.log('Fetching questions with filter:', filter);

    const questions = await QuestionBagV2.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await QuestionBagV2.countDocuments(filter);
    
    console.log(`Found ${questions.length} questions, total: ${total}`);
    
    // Transform questions for frontend
    const transformedQuestions = questions.map(transformQuestionForFrontend);

    res.json({
      questions: transformedQuestions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Failed to fetch questions', error });
  }
});

// Get random questions for a quiz
router.post('/random', async (req, res) => {
  try {
    const { count = 20, timeLimit = 30, filters = {} } = req.body;
    
    console.log('----------------------------------------------');
    console.log('Fetching random questions with filter config:', JSON.stringify(filters, null, 2));
    
    // Create a filter object based on provided filters
    const filter: any = {};
    
    // Handle single category or multiple categories
    if (filters.category) {
      filter.category = filters.category;
      console.log(`Set category filter to: ${filters.category}`);
    } else if (filters.categories && filters.categories.length > 0) {
      filter.category = { $in: filters.categories };
      console.log(`Set categories filter to: ${JSON.stringify(filters.categories)}`);
    }
    
    // Handle single question type or multiple question types
    if (filters.questionType) {
      filter.questionType = filters.questionType;
      console.log(`Set questionType filter to: ${filters.questionType}`);
    } else if (filters.questionTypes && filters.questionTypes.length > 0) {
      filter.questionType = { $in: filters.questionTypes };
      console.log(`Set questionTypes filter to: ${JSON.stringify(filters.questionTypes)}`);
    }
    
    // Handle single difficulty or multiple difficulties
    if (filters.difficulty) {
      filter.difficulty = filters.difficulty;
      console.log(`Set difficulty filter to: ${filters.difficulty}`);
    } else if (filters.difficulties && filters.difficulties.length > 0) {
      filter.difficulty = { $in: filters.difficulties };
      console.log(`Set difficulties filter to: ${JSON.stringify(filters.difficulties)}`);
    }
    
    console.log('Final MongoDB filter:', JSON.stringify(filter, null, 2));
    
    // Add sanity checks to filter out incomplete questions
    const validQuestionFilter = {
      questionText: { $exists: true, $ne: '' },  // Must have question text
      options: { $exists: true, $ne: {} },       // Must have at least one option
      correctAnswer: { $exists: true, $ne: '' }  // Must have correct answer
    };
    
    // Define type-specific validation filters
    const typeSpecificFilters = {
      'Reading Comprehension': {
        passageText: { $exists: true, $ne: '' },       // Must have a passage
        rcNumber: { $exists: true, $ne: null }         // Must have an RC number for grouping
      },
      'Critical Reasoning': {
        passageText: { $exists: true, $ne: '' }        // Must have an argument/passage
      },
      'Data Sufficiency': {
        $or: [
          {
            'metadata.statement1': { $exists: true, $ne: '' }, 
            'metadata.statement2': { $exists: true, $ne: '' }
          },
          { questionText: { $regex: /\(1\).*\(2\)/ } }  // Question contains statements
        ]
      },
      'Problem Solving': {
        // No additional requirements beyond the base validQuestionFilter
      }
    };
    
    // Final array to hold our quiz questions
    let finalQuestions = [];
    
    // Get requested question types (for logging and logic)
    let requestedTypes: string[] = [];
    if (filters.questionType) {
      requestedTypes = [filters.questionType];
    } else if (filters.questionTypes && filters.questionTypes.length > 0) {
      requestedTypes = [...filters.questionTypes];
    }
    
    console.log('Requested question types:', requestedTypes);
    
    // Distribution of question types for a balanced quiz
    // Skip this if user has specified a specific question type
    const questionTypeDistribution = (requestedTypes.length > 0) ? null : {
      'Reading Comprehension': Math.ceil(count * 0.3), // 30% RC questions
      'Critical Reasoning': Math.ceil(count * 0.2),    // 20% CR questions
      'Data Sufficiency': Math.ceil(count * 0.25),     // 25% DS questions
      'Problem Solving': Math.ceil(count * 0.25)       // 25% PS questions
    };

    // Step 1: Handle Reading Comprehension questions ONLY if explicitly requested
    const shouldHandleRC = filters.questionType === 'Reading Comprehension' || 
        (filters.questionTypes && filters.questionTypes.includes('Reading Comprehension'));
    
    if (shouldHandleRC) {
      
      // Limit to 2-3 RC passages for a 20 question quiz, scaled by count
      const maxRCPassages = Math.ceil(count / 10); // 2 passages for 20 questions
      
      // Maximum RC questions should be ~30% of total questions unless specifically requested
      const maxRCQuestions = (filters.questionType === 'Reading Comprehension' || 
                              (filters.questionTypes && filters.questionTypes.length === 1 && 
                               filters.questionTypes.includes('Reading Comprehension')))
                              ? count 
                              : Math.ceil(count * 0.3);
      
      // RC filter should respect other filter conditions too
      const rcFilter: any = {
        questionType: 'Reading Comprehension',
        ...validQuestionFilter,
        ...typeSpecificFilters['Reading Comprehension']
      };
      
      // Apply category and difficulty filters if specified
      if (filter.category) rcFilter.category = filter.category;
      if (filter.difficulty) rcFilter.difficulty = filter.difficulty;
      
      console.log('RC Filter:', rcFilter);
      
      // Find RC passage groups
      const rcGroups = await QuestionBagV2.aggregate([
        { $match: rcFilter },
        { $group: { _id: '$rcNumber', count: { $sum: 1 }, questions: { $push: '$$ROOT' } } },
        { $match: { count: { $gte: 3 } } }, // Only passages with at least 3 questions
        { $sample: { size: maxRCPassages } } // Select a limited number of RC passages
      ]);
      
      console.log(`Found ${rcGroups.length} RC passages with at least 3 questions`);
      
      // Keep track of added RC questions
      let rcQuestionsAdded = 0;
      
      // Add questions from each RC passage, up to our limit
      for (const group of rcGroups) {
        // If we've reached our RC question limit, break
        if (rcQuestionsAdded >= maxRCQuestions) break;
        
        // Filter out incomplete questions from this passage group
        const validQuestions = group.questions.filter((q: any) => 
          q.questionText && 
          q.options && 
          Object.keys(q.options).length > 0 && 
          q.correctAnswer
        );
        
        if (validQuestions.length < 3) {
          console.log(`Skipping RC passage ${group._id} - insufficient valid questions`);
          continue; // Skip this passage if it doesn't have enough valid questions
        }
        
        // Take up to 5 questions from this passage, but don't exceed our RC question limit
        const questionsToTake = Math.min(
          5, // Maximum 5 questions per passage
          validQuestions.length,
          maxRCQuestions - rcQuestionsAdded // Don't exceed our RC question limit
        );
        
        // Sort by question number if available
        const sortedQuestions = validQuestions
          .sort((a: any, b: any) => (a.questionNumber || 0) - (b.questionNumber || 0))
          .slice(0, questionsToTake);
        
        finalQuestions = [...finalQuestions, ...sortedQuestions];
        rcQuestionsAdded += sortedQuestions.length;
        
        console.log(`Added ${sortedQuestions.length} questions from RC passage ${group._id}`);
      }
      
      console.log(`Total RC questions added: ${rcQuestionsAdded}`);
      
      // If we're only requesting RC questions, we can return now
      if (requestedTypes.length === 1 && requestedTypes[0] === 'Reading Comprehension') {
        // Skip to the end (sorting, transforming, etc.)
        const transformedQuestions = finalQuestions.map(transformQuestionForFrontend);
        
        // Count questions by type for logging
        const questionCounts = finalQuestions.reduce((acc: any, q: any) => {
          acc[q.questionType] = (acc[q.questionType] || 0) + 1;
          return acc;
        }, {});
        
        console.log(`Created quiz with ${transformedQuestions.length} questions. Distribution: ${JSON.stringify(questionCounts)}`);
        
        // Generate a unique quiz ID
        const quizId = new mongoose.Types.ObjectId().toString();
        
        return res.json({
          quizId,
          questions: transformedQuestions,
          timeLimit
        });
      }
    }
    
    // Step 2: Fill the remaining slots with other question types according to distribution or specific types
    const remainingCount = count - finalQuestions.length;
    
    if (remainingCount > 0) {
      // If user specified specific question types, prioritize those
      if (requestedTypes.length > 0) {
        // For question types selection, get the required number
        const specificTypesFilter = {
          ...filter,
          ...validQuestionFilter,
        };
        
        // Exclude already added RC questions
        if (finalQuestions.length > 0) {
          specificTypesFilter._id = { $nin: finalQuestions.map((q: any) => q._id) };
        }

        // Filter out RC from the requested types if we've already handled it
        const remainingTypes = requestedTypes.filter(type => 
          !finalQuestions.some(q => q.questionType === type)
        );
        
        console.log(`Remaining types to fetch: ${remainingTypes.join(', ')}`);
        
        // Only proceed if we have question types to search for
        if (remainingTypes.length > 0) {
          // Create an array to hold questions of different types
          const typedQuestions: any[] = [];
          
          // For each requested type, apply the appropriate type-specific filter
          for (const questionType of remainingTypes) {
            const typeFilter = {
              ...specificTypesFilter,
              questionType,
              ...(typeSpecificFilters[questionType] || {})
            };
            
            console.log(`Fetching ${questionType} questions with filter:`, typeFilter);
            
            // Fetch questions for this type
            const questionsOfType = await QuestionBagV2.aggregate([
              { $match: typeFilter },
              { $sample: { size: Math.ceil(remainingCount / remainingTypes.length) } }
            ]);
            
            console.log(`Added ${questionsOfType.length} ${questionType} questions`);
            typedQuestions.push(...questionsOfType);
          }
          
          // Add all typed questions to final questions
          finalQuestions = [...finalQuestions, ...typedQuestions];
        }
      } 
      // Otherwise, distribute according to our balanced mix
      else if (questionTypeDistribution) {
        // Calculate how many of each type we still need
        const crTarget = questionTypeDistribution['Critical Reasoning'];
        const dsTarget = questionTypeDistribution['Data Sufficiency'];
        const psTarget = questionTypeDistribution['Problem Solving'];
        
        // Create a base filter for non-RC questions
        const baseFilter = {
          ...filter,
          ...validQuestionFilter,
          _id: { $nin: finalQuestions.map((q: any) => q._id) }
        };
        
        // Get Critical Reasoning questions
        if (crTarget > 0 && finalQuestions.length < count) {
          const crFilter = {
            ...baseFilter,
            questionType: 'Critical Reasoning',
            ...typeSpecificFilters['Critical Reasoning']
          };
          
          const crQuestions = await QuestionBagV2.aggregate([
            { $match: crFilter },
            { $sample: { size: Math.min(crTarget, count - finalQuestions.length) } }
          ]);
          
          console.log(`Added ${crQuestions.length} Critical Reasoning questions`);
          finalQuestions = [...finalQuestions, ...crQuestions];
        }
        
        // Get Data Sufficiency questions
        if (dsTarget > 0 && finalQuestions.length < count) {
          const dsFilter = {
            ...baseFilter,
            questionType: 'Data Sufficiency',
            ...typeSpecificFilters['Data Sufficiency']
          };
          
          const dsQuestions = await QuestionBagV2.aggregate([
            { $match: dsFilter },
            { $sample: { size: Math.min(dsTarget, count - finalQuestions.length) } }
          ]);
          
          console.log(`Added ${dsQuestions.length} Data Sufficiency questions`);
          finalQuestions = [...finalQuestions, ...dsQuestions];
        }
        
        // Get Problem Solving questions
        if (psTarget > 0 && finalQuestions.length < count) {
          const psFilter = {
            ...baseFilter,
            questionType: 'Problem Solving',
            ...typeSpecificFilters['Problem Solving']
          };
          
          const psQuestions = await QuestionBagV2.aggregate([
            { $match: psFilter },
            { $sample: { size: Math.min(psTarget, count - finalQuestions.length) } }
          ]);
          
          console.log(`Added ${psQuestions.length} Problem Solving questions`);
          finalQuestions = [...finalQuestions, ...psQuestions];
        }
      }
      
      // If we still don't have enough questions, fill with any valid questions
      if (finalQuestions.length < count) {
        console.log(`Still need ${count - finalQuestions.length} more questions. Using fallback query.`);
        
        // Get the types we already have in our quiz
        const existingTypes = new Set(finalQuestions.map((q: any) => q.questionType));
        
        // Prepare a list of question types to try, based on what's requested
        let typesToTry: string[] = [];
        
        // If specific types were requested, prioritize those
        if (requestedTypes.length > 0) {
          typesToTry = [...requestedTypes];
        } 
        // Otherwise use all types except Reading Comprehension unless specifically requested
        else {
          typesToTry = ['Problem Solving', 'Data Sufficiency', 'Critical Reasoning'];
          
          // Only include RC if explicitly requested or if we've already added some RC questions
          if (shouldHandleRC || existingTypes.has('Reading Comprehension')) {
            typesToTry.push('Reading Comprehension');
          }
        }
        
        // Create an array to hold our fallback questions
        const fallbackQuestions: any[] = [];
        
        // Try to fetch questions of each remaining type
        for (const questionType of typesToTry) {
          if (finalQuestions.length + fallbackQuestions.length >= count) break;
          
          const typeFilter = {
            ...filter,
            ...validQuestionFilter,
            questionType,
            ...(typeSpecificFilters[questionType] || {}),
            _id: { $nin: [...finalQuestions.map((q: any) => q._id), ...fallbackQuestions.map((q: any) => q._id)] }
          };
          
          const questionsOfType = await QuestionBagV2.aggregate([
            { $match: typeFilter },
            { $sample: { size: Math.ceil((count - finalQuestions.length - fallbackQuestions.length) / typesToTry.length) } }
          ]);
          
          console.log(`Added ${questionsOfType.length} ${questionType} questions as fallback`);
          fallbackQuestions.push(...questionsOfType);
        }
        
        // Add all fallback questions to final questions
        finalQuestions = [...finalQuestions, ...fallbackQuestions];
        
        // Last resort - if we still don't have enough, try again with minimal requirements
        if (finalQuestions.length < count) {
          // Create a more permissive filter but still respect question type if specified
          const anyQuestionsFilter: any = {
            questionText: { $exists: true, $ne: '' },  // Only require question text
            _id: { $nin: finalQuestions.map((q: any) => q._id) }
          };
          
          // If specific question types were requested, still respect that
          if (filter.questionType) {
            anyQuestionsFilter.questionType = filter.questionType;
          } else if (filter.questionType && filter.questionType.$in && filter.questionType.$in.length > 0) {
            anyQuestionsFilter.questionType = filter.questionType;
          }
          
          const anyQuestions = await QuestionBagV2.aggregate([
            { $match: anyQuestionsFilter },
            { $sample: { size: count - finalQuestions.length } }
          ]);
          
          console.log(`Added ${anyQuestions.length} additional questions with minimal validation to complete the quiz`);
          finalQuestions = [...finalQuestions, ...anyQuestions];
        }
      }
    }
    
    // Don't shuffle RC questions to keep passage questions together
    // Instead, keep RC passages intact but randomize the order of other question types
    let rcQuestions: any[] = [];
    let nonRcQuestions: any[] = [];
    
    // Separate RC from non-RC questions
    finalQuestions.forEach((q: any) => {
      if (q.questionType === 'Reading Comprehension') {
        rcQuestions.push(q);
      } else {
        nonRcQuestions.push(q);
      }
    });
    
    // Shuffle non-RC questions
    nonRcQuestions = nonRcQuestions.sort(() => Math.random() - 0.5);
    
    // Group RC questions by passage to keep them together
    const rcPassageGroups = new Map();
    rcQuestions.forEach((q: any) => {
      if (!rcPassageGroups.has(q.rcNumber)) {
        rcPassageGroups.set(q.rcNumber, []);
      }
      rcPassageGroups.get(q.rcNumber).push(q);
    });
    
    // Create array of RC passage groups
    const rcGroupsArray = Array.from(rcPassageGroups.values());
    
    // Shuffle the order of RC passage groups
    rcGroupsArray.sort(() => Math.random() - 0.5);
    
    // Flatten RC groups while maintaining questions within each group
    rcQuestions = rcGroupsArray.flat();
    
    // Randomly decide to put RC at beginning, middle or end
    const rcPosition = Math.floor(Math.random() * 3); // 0, 1, or 2
    
    if (rcQuestions.length === 0) {
      // No RC questions, just use shuffled non-RC questions
      finalQuestions = nonRcQuestions;
    } else if (rcPosition === 0) {
      // RC at beginning
      finalQuestions = [...rcQuestions, ...nonRcQuestions];
    } else if (rcPosition === 1 && nonRcQuestions.length > 2) {
      // RC in middle - split non-RC questions
      const midPoint = Math.floor(nonRcQuestions.length / 2);
      finalQuestions = [
        ...nonRcQuestions.slice(0, midPoint),
        ...rcQuestions,
        ...nonRcQuestions.slice(midPoint)
      ];
    } else {
      // RC at end or fallback
      finalQuestions = [...nonRcQuestions, ...rcQuestions];
    }
    
    // Generate a unique quiz ID
    const quizId = new mongoose.Types.ObjectId().toString();
    
    // Transform questions for frontend
    const transformedQuestions = finalQuestions.map(transformQuestionForFrontend);
    
    // Count questions by type and check sanity
    const questionCounts = finalQuestions.reduce((acc: any, q: any) => {
      acc[q.questionType] = (acc[q.questionType] || 0) + 1;
      return acc;
    }, {});

    // Log details about the quiz
    console.log('----------------------------------------------');
    console.log(`Quiz configuration - Requested filters:`, JSON.stringify(filters, null, 2));
    console.log(`MongoDB filter used:`, JSON.stringify(filter, null, 2));

    // Count questions missing key fields by type
    const invalidQuestions = finalQuestions.filter((q: any) => {
      const questionType = q.questionType;
      
      // Check base requirements
      if (!q.questionText || !q.correctAnswer || !q.options || Object.keys(q.options).length === 0) {
        return true;
      }
      
      // Check type-specific requirements
      if (questionType === 'Reading Comprehension' && (!q.passageText || !q.rcNumber)) {
        return true;
      }
      if (questionType === 'Critical Reasoning' && !q.passageText) {
        return true;
      }
      if (questionType === 'Data Sufficiency') {
        // Check if statements exist either in metadata or in question text
        const hasMetadataStatements = q.metadata && 
          q.metadata.statement1 && 
          q.metadata.statement2;
        
        const hasStatementsInQuestion = q.questionText.match(/\(1\).*\(2\)/);
        
        if (!hasMetadataStatements && !hasStatementsInQuestion) {
          return true;
        }
      }
      
      return false;
    });

    if (invalidQuestions.length > 0) {
      console.log(`Warning: ${invalidQuestions.length} questions may have missing required fields:`);
      invalidQuestions.forEach((q: any) => {
        console.log(`- ${q._id}: ${q.questionType} question is missing required fields`);
      });
    }

    // Verify the types of questions returned match the requested types
    if (requestedTypes.length > 0) {
      const typesInQuiz = new Set(finalQuestions.map((q: any) => q.questionType));
      const unexpectedTypes = Array.from(typesInQuiz).filter(type => !requestedTypes.includes(type as string));
      const missingTypes = requestedTypes.filter(type => !typesInQuiz.has(type));
      
      if (unexpectedTypes.length > 0) {
        console.log(`Warning: Quiz contains question types that weren't requested: ${unexpectedTypes.join(', ')}`);
      }
      
      if (missingTypes.length > 0) {
        console.log(`Warning: Requested question types missing from quiz: ${missingTypes.join(', ')}`);
      }
    }

    console.log(`Created quiz with ${transformedQuestions.length} questions.`);
    console.log(`Question type distribution: ${JSON.stringify(questionCounts)}`);
    console.log('----------------------------------------------');
    
    res.json({
      quizId,
      questions: transformedQuestions,
      timeLimit
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    res.status(500).json({ message: 'Failed to fetch random questions', error });
  }
});

// Get a question by ID
router.get('/:id', async (req, res) => {
  try {
    const question = await QuestionBagV2.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Transform question for frontend
    const transformedQuestion = transformQuestionForFrontend(question);
    
    res.json(transformedQuestion);
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ message: 'Failed to fetch question', error });
  }
});

// Update a question by ID
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    console.log(`Updating question ${id} with data:`, updateData);
    
    const question = await QuestionBagV2.findById(id);
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Update the question
    const updatedQuestion = await QuestionBagV2.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    // Transform the question for frontend
    const transformedQuestion = transformQuestionForFrontend(updatedQuestion);
    
    console.log('Question updated successfully');
    res.json(transformedQuestion);
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ message: 'Failed to update question', error });
  }
});

// Delete a question by ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Deleting question ${id}`);
    
    const question = await QuestionBagV2.findById(id);
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Delete the question
    await QuestionBagV2.findByIdAndDelete(id);
    
    console.log('Question deleted successfully');
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ message: 'Failed to delete question', error });
  }
});

// Create a new question
router.post('/', async (req, res) => {
  try {
    const questionData = req.body;
    
    console.log('Creating new question with data:', JSON.stringify(questionData, null, 2));
    
    // Create the question
    const newQuestion = new QuestionBagV2(questionData);
    await newQuestion.save();
    
    // Transform the question for frontend
    const transformedQuestion = transformQuestionForFrontend(newQuestion);
    
    console.log('Question created successfully with ID:', newQuestion._id);
    res.status(201).json(transformedQuestion);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ message: 'Failed to create question', error });
  }
});

export default router; 
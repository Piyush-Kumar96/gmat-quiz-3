import re

# Read the file
with open('src/pages/QuizPage.tsx', 'r') as f:
    content = f.read()

# Add quiz started tracking after setQuizId
quiz_started_tracking = '''
        
        // Track quiz started
        analytics.trackQuizStarted({
          quizId: data.quizId,
          count: config.count,
          timeLimit: config.timeLimit,
          category: config.category,
          difficulty: config.difficulty?.toString()
        });'''

content = content.replace(
    'setQuizId(data.quizId);',
    'setQuizId(data.quizId);' + quiz_started_tracking
)

# Add question answered tracking in handleAnswerSelect
question_answered_tracking = '''
      
      // Track question answered
      const currentQuestion = questions[currentQuestionIndex];
      if (currentQuestion) {
        analytics.trackQuestionAnswered({
          questionId: questionId,
          correct: false, // We don't know if it's correct yet
          timeTaken: questionTimeSpent[currentQuestionIndex] || 0,
          questionType: currentQuestion.questionType,
          category: currentQuestion.category,
          difficulty: currentQuestion.difficulty
        });
      }'''

content = content.replace(
    'setAnswers(prev => ({\n        ...prev,\n        [questionId]: answer\n      }));',
    'setAnswers(prev => ({\n        ...prev,\n        [questionId]: answer\n      }));' + question_answered_tracking
)

# Add question flagged tracking in toggleFlag
question_flagged_tracking = '''
        
        // Track question flagged
        const currentQuestion = questions[currentQuestionIndex];
        if (currentQuestion) {
          analytics.trackQuestionFlagged({
            questionId: questionId,
            quizId: quizId || undefined,
            questionType: currentQuestion.questionType
          });
        }'''

content = content.replace(
    'setFlaggedQuestions(prev => [...prev, questionId]);',
    'setFlaggedQuestions(prev => [...prev, questionId]);' + question_flagged_tracking
)

# Add quiz completed tracking in handleSubmit
quiz_completed_tracking = '''
      
      // Track quiz completed
      const correctAnswers = submission.results.filter(r => r.isCorrect).length;
      analytics.trackQuizCompleted({
        quizId: quizId,
        totalCorrect: correctAnswers,
        totalTime: totalTimeSpent,
        totalQuestions: questions.length,
        score: submission.percentage,
        category: config.category
      });'''

content = content.replace(
    'setIsSubmitting(false);\n      navigate(\'/results\', { state: { submission } });',
    'setIsSubmitting(false);' + quiz_completed_tracking + '\n      navigate(\'/results\', { state: { submission } });'
)

# Write the file back
with open('src/pages/QuizPage.tsx', 'w') as f:
    f.write(content)

print("Analytics tracking added to QuizPage.tsx") 